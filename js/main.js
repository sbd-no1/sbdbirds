/*
  Refactored v3: remove 60ms debounce per user request.
  - Keep Pointer Events (preferred) or touchstart+mousedown suppression to avoid double-fire
  - Keep prevention of Space auto-repeat
  - Keep sounds/effects
*/

(function(){
  'use strict';

  var debugmode = false;
  var states = Object.freeze({ SplashScreen:0, GameScreen:1, ScoreScreen:2 });
  var currentstate;

  var gravity = 0.25;
  var jump = -4.6;

  var PLAYER_WIDTH = 34.0;
  var PLAYER_HEIGHT = 24.0;
  var playerX = 60;

  var pipeGap = 90;
  var pipeWidth = 52;
  var pipePadding = 80;
  var spawnInterval = 1400; // ms
  var pipeSpeed = 150; // px/s

  var score = 0;
  var highscore = 0;

  var volume = 30;
  var soundJump = new buzz.sound(["assets/sounds/sfx_wing.mp3","assets/sounds/sfx_wing.ogg"]);
  var soundScore = new buzz.sound(["assets/sounds/sfx_point.mp3","assets/sounds/sfx_point.ogg"]);
  var soundHit   = new buzz.sound(["assets/sounds/sfx_hit.mp3","assets/sounds/sfx_hit.ogg"]);
  var soundDie   = new buzz.sound(["assets/sounds/sfx_die.mp3","assets/sounds/sfx_die.ogg"]);
  var soundSwoosh= new buzz.sound(["assets/sounds/sfx_swooshing.mp3","assets/sounds/sfx_swooshing.ogg"]);
  buzz.all().setVolume(volume);

  var $doc = $(document);
  var $flyArea = $('#flyarea');
  var $player = $('#player');
  var $splash = $('#splash');
  var $scoreboard = $('#scoreboard');
  var $replay = $('#replay');
  var $land = $('#land');
  var $ceiling = $('#ceiling');

  var flyAreaHeight=0, flyAreaWidth=0, landTop=0, ceilingBottom=0;

  var velocity=0, positionY=180, rotation=0;
  var pipes = [];
  var rafId=null, lastTS=0, spawnAccumulator=0;
  var replayclickable=false, audioPrimed=false;

  $(function(){
    if(window.location.search === "?debug") debugmode = true;
    if(window.location.search === "?easy") pipeGap = 200;
    var savedscore = getCookie('highscore'); if(savedscore!=='') highscore=parseInt(savedscore,10);
    $player.css({ willChange:'transform' });
    bindInput();
    showSplash();
  });

  function getCookie(cname){
    var name=cname+"="; var ca=document.cookie.split(';');
    for(var i=0;i<ca.length;i++){ var c=ca[i].trim(); if(c.indexOf(name)===0) return c.substring(name.length,c.length);} return "";
  }
  function setCookie(cname,cvalue,exdays){ var d=new Date(); d.setTime(d.getTime()+(exdays*86400000)); var expires="expires="+d.toGMTString(); document.cookie=cname+"="+cvalue+"; "+expires; }

  function primeAudio(){ if(audioPrimed) return; try{ buzz.all().load(); }catch(e){} audioPrimed=true; }

  function bindInput(){
    // Keyboard: prevent space auto-repeat to avoid unintentional rapid jumps
    $doc.on('keydown', function(e){
      if(e.code==='Space' || e.keyCode===32){
        if(e.repeat) return;
        if(currentstate===states.ScoreScreen) $replay.click(); else screenClick();
      }
    });

    var area=document.getElementById('flyarea');
    if(!area) return;

    // Prefer Pointer Events to avoid touch+mouse double dispatch
    if(window.PointerEvent){
      area.style.touchAction = 'none';
      area.addEventListener('pointerdown', function(ev){
        if(ev.pointerType==='mouse' && ev.button!==0) return;
        ev.preventDefault(); // ensure we don't generate extra events
        screenClick();
      }, {passive:false});
    } else {
      // Fallback: use touchstart and suppress the emulated mousedown
      var suppressMouseUntil = 0;
      area.addEventListener('touchstart', function(ev){
        suppressMouseUntil = performance.now() + 400;
        ev.preventDefault();
        screenClick();
      }, {passive:false});
      area.addEventListener('mousedown', function(ev){
        if(performance.now() < suppressMouseUntil) return; // ignore synthetic mouse
        if(ev.button!==0) return;
        screenClick();
      });
    }
  }

  function screenClick(){
    primeAudio();
    if(currentstate===states.GameScreen) playerJump();
    else if(currentstate===states.SplashScreen) startGame();
  }

  function playerJump(){ velocity = jump; try{ soundJump.play(); }catch(e){} }

  function showSplash(){
    currentstate = states.SplashScreen;
    velocity=0; positionY=180; rotation=0; score=0;
    for(var i=0;i<pipes.length;i++) pipes[i].el.remove(); pipes.length=0;
    $('.animated').css('animation-play-state','running').css('-webkit-animation-play-state','running');
    updatePlayerTransform();
    try{ soundSwoosh.stop(); soundSwoosh.play(); }catch(e){}
    $splash.stop().transition({ opacity:1 }, 2000, 'ease');
  }

  function startGame(){
    currentstate = states.GameScreen;
    flyAreaHeight = $flyArea.height();
    flyAreaWidth  = $flyArea.width();
    landTop = $land.offset().top - $flyArea.offset().top;
    ceilingBottom = ($ceiling.offset().top - $flyArea.offset().top) + $ceiling.height();

    score=0; setBigScore();
    spawnAccumulator=0; lastTS=0;
    $splash.stop().transition({ opacity:0 }, 500, 'ease');
    if(debugmode) $('.boundingbox').show();

    startRaf();
    playerJump();
  }

  function startRaf(){ stopRaf(); rafId = requestAnimationFrame(tick); }
  function stopRaf(){ if(rafId) cancelAnimationFrame(rafId); rafId=null; }

  function tick(ts){ if(!lastTS) lastTS=ts; var dt=(ts-lastTS)/1000; lastTS=ts; gameloop(dt); rafId=requestAnimationFrame(tick); }

  function gameloop(dt){
    velocity += gravity;
    positionY += velocity;

    if(positionY < 0) positionY = 0; // ceiling clamp

    rotation = Math.min((velocity/10)*90, 90);
    updatePlayerTransform();

    spawnAccumulator += dt*1000; if(spawnAccumulator>=spawnInterval){ spawnAccumulator-=spawnInterval; createPipe(); }
    updatePipes(dt);

    var playerBottom = positionY + PLAYER_HEIGHT;
    if(playerBottom >= landTop){ playerDead(); return; }
    if(debugmode) updateDebugBoxes();
  }

  function updatePlayerTransform(){
    var t='translate3d('+playerX+'px,'+positionY+'px,0) rotate('+rotation+'deg)';
    $player.css({ transform:t, webkitTransform:t, top:0, left:0 });
  }

  function updateDebugBoxes(){
    var boxwidth = PLAYER_WIDTH - (Math.sin(Math.abs(rotation)*Math.PI/180)*8);
    var boxheight = (PLAYER_HEIGHT + PLAYER_HEIGHT)/2;
    var boxleft = playerX + (PLAYER_WIDTH - boxwidth)/2;
    var boxtop = positionY + (PLAYER_HEIGHT - boxheight)/2;
    $('#playerbox').css({ left:boxleft+'px', top:boxtop+'px', width:boxwidth+'px', height:boxheight+'px' });
    if(pipes.length){ var np=pipes[0]; $('#pipebox').css({ left:(np.x)+'px', top:np.gapTop+'px', width:pipeWidth+'px', height:pipeGap+'px' }); }
  }

  function createPipe(){
    var constraint = flyAreaHeight - pipeGap - (pipePadding*2);
    var topheight = Math.floor((Math.random()*constraint) + pipePadding);
    var bottomheight = (flyAreaHeight - pipeGap) - topheight;

    var $pipe = $('<div class="pipe"></div>');
    var $upper = $('<div class="pipe_upper"></div>').css('height', topheight+'px');
    var $lower = $('<div class="pipe_lower"></div>').css('height', bottomheight+'px');
    $pipe.append($upper).append($lower);

    var startX = flyAreaWidth;
    $pipe.css({ transform:'translate3d('+startX+'px,0,0)' });
    $flyArea.append($pipe);

    pipes.push({ el:$pipe, x:startX, gapTop:topheight, scored:false });
  }

  function updatePipes(dt){
    if(!pipes.length) return;
    var dx = pipeSpeed * dt;
    for(var i=0;i<pipes.length;i++){
      var p=pipes[i];
      p.x -= dx;
      p.el.css({ transform:'translate3d('+p.x+'px,0,0)' });

      if(!p.scored && (playerX > (p.x + pipeWidth))){ p.scored=true; playerScore(); }

      var playerLeft=playerX, playerRight=playerX+PLAYER_WIDTH, pipeLeft=p.x, pipeRight=p.x+pipeWidth;
      if(playerRight>pipeLeft && playerLeft<pipeRight){
        var boxwidth = PLAYER_WIDTH - (Math.sin(Math.abs(rotation)*Math.PI/180)*8);
        var boxheight = (PLAYER_HEIGHT + PLAYER_HEIGHT)/2;
        var boxtop = positionY + (PLAYER_HEIGHT - boxheight)/2;
        var boxbottom = boxtop + boxheight;
        var pipetop = p.gapTop, pipebottom = p.gapTop + pipeGap;
        if(!(boxtop > pipetop && boxbottom < pipebottom)){ playerDead(); return; }
      }
    }
    while(pipes.length && pipes[0].x <= -pipeWidth - 100){ pipes[0].el.remove(); pipes.shift(); }
  }

  function setBigScore(erase){ var e=$('#bigscore'); e.empty(); if(erase) return; var d=score.toString().split(''); for(var i=0;i<d.length;i++) e.append("<img src='assets/font_big_"+d[i]+".png' alt='"+d[i]+"'>"); }
  function setSmallScore(){ var e=$('#currentscore'); e.empty(); var d=score.toString().split(''); for(var i=0;i<d.length;i++) e.append("<img src='assets/font_small_"+d[i]+".png' alt='"+d[i]+"'>"); }
  function setHighScore(){ var e=$('#highscore'); e.empty(); var d=highscore.toString().split(''); for(var i=0;i<d.length;i++) e.append("<img src='assets/font_small_"+d[i]+".png' alt='"+d[i]+"'>"); }
  function setMedal(){ var e=$('#medal'); e.empty(); if(score<10) return false; var medal='bronze'; if(score>=40) medal='platinum'; else if(score>=30) medal='gold'; else if(score>=20) medal='silver'; e.append('<img src="assets/medal_'+medal+'.png" alt="'+medal+'">'); return true; }
  function playerScore(){ score+=1; try{ soundScore.play(); }catch(e){} setBigScore(); }

  function playerDead(){
    $('.animated').css('animation-play-state','paused').css('-webkit-animation-play-state','paused');
    currentstate = states.ScoreScreen;
    stopRaf();
    var playerBottom = positionY + PLAYER_HEIGHT; var movey = Math.max(0, landTop - playerBottom); var targetY=positionY+movey;
    $player.css({ transition:'transform 1s cubic-bezier(.645,.045,.355,1)', webkitTransition:'transform 1s cubic-bezier(.645,.045,.355,1)' });
    var t='translate3d('+playerX+'px,'+targetY+'px,0) rotate(90deg)'; $player.css({ transform:t, webkitTransform:t });
    if(isIncompatible.any()){ showScore(); }
    else { try { soundHit.play().bindOnce('ended', function(){ soundDie.play().bindOnce('ended', function(){ showScore(); }); }); } catch(e){ showScore(); } }
  }

  function showScore(){
    $scoreboard.css('display','block'); setBigScore(true);
    if(score>highscore){ highscore=score; setCookie('highscore', highscore, 999); }
    setSmallScore(); setHighScore();
    var wonmedal = setMedal();
    try{ soundSwoosh.stop(); soundSwoosh.play(); }catch(e){}
    $scoreboard.css({ y:'40px', opacity:0 }); $replay.css({ y:'40px', opacity:0 });
    $scoreboard.transition({ y:'0px', opacity:1 }, 600, 'ease', function(){ try{ soundSwoosh.stop(); soundSwoosh.play(); }catch(e){} $replay.transition({ y:'0px', opacity:1 }, 600, 'ease'); if(wonmedal){ $('#medal').css({ scale:2, opacity:0 }).transition({ opacity:1, scale:1 }, 1200, 'ease'); }});
    replayclickable=true;
  }

  $replay.on('click', function(){ if(!replayclickable) return; replayclickable=false; try{ soundSwoosh.stop(); soundSwoosh.play(); }catch(e){} $scoreboard.transition({ y:'-40px', opacity:0 }, 1000, 'ease', function(){ $scoreboard.css('display','none'); $player.css({ transition:'', webkitTransition:'' }); showSplash(); }); });

  var isIncompatible = {
    Android:function(){ return navigator.userAgent.match(/Android/i); },
    BlackBerry:function(){ return navigator.userAgent.match(/BlackBerry/i); },
    iOS:function(){ return navigator.userAgent.match(/iPhone|iPad|iPod/i); },
    Opera:function(){ return navigator.userAgent.match(/Opera Mini/i); },
    Safari:function(){ return (navigator.userAgent.match(/OS X.*Safari/) && !navigator.userAgent.match(/Chrome/)); },
    Windows:function(){ return navigator.userAgent.match(/IEMobile/i); },
    any:function(){ return (this.Android()||this.BlackBerry()||this.iOS()||this.Opera()||this.Safari()||this.Windows()); }
  };

})();
