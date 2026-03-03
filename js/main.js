/*
  Refactored Flappy-style game loop for better iOS performance
  - requestAnimationFrame-based main loop
  - Transform-based rendering (translate3d + rotate) to avoid layout thrash
  - Pure logical coordinates for player/pipes; no per-frame layout reads
  - Keep Buzz.js sounds and existing transition-based effects for UI
  - Passive touch listeners and limited event targets
*/

(function(){
  'use strict';

  // =====================
  // Config & State
  // =====================
  var debugmode = false;
  var states = Object.freeze({
    SplashScreen: 0,
    GameScreen: 1,
    ScoreScreen: 2
  });
  var currentstate;

  // Physics
  var gravity = 0.25;
  var jump = -4.6;

  // Player visuals
  var PLAYER_WIDTH = 34.0;
  var PLAYER_HEIGHT = 24.0;
  var playerX = 60; // fixed logical X

  // Pipes
  var pipeGap = 90; // original pipeheight
  var pipeWidth = 52;
  var pipePadding = 80;
  var spawnInterval = 1400; // ms between pipes (keep original cadence)
  var pipeSpeed = 150; // px/second, JS-driven

  // Score
  var score = 0;
  var highscore = 0;

  // Audio (keep Buzz.js + add mp3 sources for iOS)
  var volume = 30;
  var soundJump = new buzz.sound(["assets/sounds/sfx_wing.mp3", "assets/sounds/sfx_wing.ogg"]);
  var soundScore = new buzz.sound(["assets/sounds/sfx_point.mp3", "assets/sounds/sfx_point.ogg"]);
  var soundHit = new buzz.sound(["assets/sounds/sfx_hit.mp3", "assets/sounds/sfx_hit.ogg"]);
  var soundDie = new buzz.sound(["assets/sounds/sfx_die.mp3", "assets/sounds/sfx_die.ogg"]);
  var soundSwoosh = new buzz.sound(["assets/sounds/sfx_swooshing.mp3", "assets/sounds/sfx_swooshing.ogg"]);
  buzz.all().setVolume(volume);

  // DOM refs
  var $doc = $(document);
  var $win = $(window);
  var $flyArea = $('#flyarea');
  var $player = $('#player');
  var $splash = $('#splash');
  var $scoreboard = $('#scoreboard');
  var $replay = $('#replay');
  var $land = $('#land');
  var $ceiling = $('#ceiling');

  // Runtime dimensions (resolved once per round)
  var flyAreaHeight = 0;
  var flyAreaWidth = 0;
  var landTop = 0; // y coordinate of land's top edge relative to flyarea
  var ceilingBottom = 0;

  // Player state
  var velocity = 0;
  var positionY = 180;
  var rotation = 0;

  // Pipes (logic-driven)
  var pipes = []; // {el: jQueryDiv, x, gapTop, scored}

  // Loops
  var rafId = null;
  var lastTS = 0;
  var spawnAccumulator = 0;

  // Flags
  var replayclickable = false;
  var audioPrimed = false;

  // =====================
  // Utils
  // =====================
  function getCookie(cname){
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++){
      var c = ca[i].trim();
      if(c.indexOf(name)===0) return c.substring(name.length,c.length);
    }
    return "";
  }
  function setCookie(cname,cvalue,exdays){
    var d = new Date();
    d.setTime(d.getTime()+(exdays*24*60*60*1000));
    var expires = "expires="+d.toGMTString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
  }

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  // =====================
  // Init
  // =====================
  $(function(){
    if(window.location.search === "?debug") debugmode = true;
    if(window.location.search === "?easy") pipeGap = 200;

    var savedscore = getCookie("highscore");
    if(savedscore !== "") highscore = parseInt(savedscore, 10);

    // one-time CSS hint
    $player.css({ willChange: 'transform' });

    bindInput();
    showSplash();
  });

  // =====================
  // Input
  // =====================
  function primeAudio(){
    if(audioPrimed) return;
    try{ buzz.all().load(); }catch(e){}
    audioPrimed = true;
  }

  function bindInput(){
    // Space bar
    $doc.on('keydown', function(e){
      if(e.keyCode === 32){
        if(currentstate === states.ScoreScreen) $replay.click();
        else screenClick();
      }
    });

    // Touch / Mouse on fly area only
    var area = document.getElementById('flyarea');
    if(area){
      area.addEventListener('touchstart', function(){ screenClick(); }, { passive: true });
      area.addEventListener('mousedown', function(){ screenClick(); });
    }
  }

  function screenClick(){
    primeAudio();

    if(currentstate === states.GameScreen){
      playerJump();
    } else if(currentstate === states.SplashScreen){
      startGame();
    }
  }

  function playerJump(){
    velocity = jump;
    try { soundJump.play(); } catch(e){}
  }

  // =====================
  // Screens
  // =====================
  function showSplash(){
    currentstate = states.SplashScreen;

    // reset player
    velocity = 0; positionY = 180; rotation = 0; score = 0;

    // clear pipes
    for(var i=0;i<pipes.length;i++) pipes[i].el.remove();
    pipes.length = 0;

    // resume any CSS background animations
    $('.animated').css('animation-play-state', 'running')
                  .css('-webkit-animation-play-state', 'running');

    // place player
    updatePlayerTransform();

    try { soundSwoosh.stop(); soundSwoosh.play(); } catch(e){}

    // splash fade in
    $splash.stop().transition({ opacity: 1 }, 2000, 'ease');
  }

  function startGame(){
    currentstate = states.GameScreen;

    // Resolve dimensions once per round
    flyAreaHeight = $flyArea.height();
    flyAreaWidth  = $flyArea.width();
    landTop = $land.offset().top - $flyArea.offset().top; // relative to flyarea
    ceilingBottom = ($ceiling.offset().top - $flyArea.offset().top) + $ceiling.height();

    // Reset state
    score = 0; setBigScore();
    spawnAccumulator = 0; lastTS = 0;

    // UI
    $splash.stop().transition({ opacity: 0 }, 500, 'ease');
    if(debugmode) $('.boundingbox').show();

    // Start loop
    startRaf();

    // first jump
    playerJump();
  }

  // =====================
  // Main Loop (rAF)
  // =====================
  function startRaf(){
    stopRaf();
    rafId = requestAnimationFrame(tick);
  }
  function stopRaf(){
    if(rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick(ts){
    if(!lastTS) lastTS = ts;
    var dt = (ts - lastTS) / 1000; // seconds
    lastTS = ts;

    gameloop(dt);
    rafId = requestAnimationFrame(tick);
  }

  function gameloop(dt){
    // Physics update
    velocity += gravity;
    positionY += velocity;

    // Clamp to ceiling
    if(positionY <= 0 || (positionY <= (ceilingBottom - PLAYER_HEIGHT))){
      positionY = Math.max(0, positionY);
    }

    // Update player rotation & transform
    rotation = Math.min((velocity / 10) * 90, 90);
    updatePlayerTransform();

    // Spawn pipes
    spawnAccumulator += dt * 1000;
    if(spawnAccumulator >= spawnInterval){
      spawnAccumulator -= spawnInterval;
      createPipe();
    }

    // Move pipes & handle scoring
    updatePipes(dt);

    // Collision with ground
    var playerBottom = positionY + PLAYER_HEIGHT;
    if(playerBottom >= landTop){
      playerDead();
      return;
    }

    // Debug boxes
    if(debugmode) updateDebugBoxes();
  }

  // =====================
  // Rendering
  // =====================
  function updatePlayerTransform(){
    var t = 'translate3d(' + playerX + 'px,' + positionY + 'px,0) rotate(' + rotation + 'deg)';
    $player.css({ transform: t, webkitTransform: t, top: 0, left: 0 });
  }

  function updateDebugBoxes(){
    // Player debug box approximation similar to original logic
    var boxwidth = PLAYER_WIDTH - (Math.sin(Math.abs(rotation) * Math.PI / 180) * 8);
    var boxheight = (PLAYER_HEIGHT + PLAYER_HEIGHT) / 2; // simple approx
    var boxleft = playerX + (PLAYER_WIDTH - boxwidth) / 2;
    var boxtop = positionY + (PLAYER_HEIGHT - boxheight) / 2;

    var $pbox = $('#playerbox');
    $pbox.css({ left: boxleft + 'px', top: boxtop + 'px', width: boxwidth + 'px', height: boxheight + 'px' });

    if(pipes.length){
      var np = pipes[0];
      var $pipebox = $('#pipebox');
      $pipebox.css({ left: (np.x) + 'px', top: np.gapTop + 'px', width: pipeWidth + 'px', height: pipeGap + 'px' });
    }
  }

  // =====================
  // Pipes
  // =====================
  function createPipe(){
    // Compute gap position logically (respect padding)
    var constraint = flyAreaHeight - pipeGap - (pipePadding * 2);
    var topheight = Math.floor((Math.random() * constraint) + pipePadding);

    // Build DOM (do NOT add class 'animated' to avoid CSS movement)
    var $pipe = $('<div class="pipe"></div>');
    var $upper = $('<div class="pipe_upper"></div>').css('height', topheight + 'px');
    var bottomheight = (flyAreaHeight - pipeGap) - topheight;
    var $lower = $('<div class="pipe_lower"></div>').css('height', bottomheight + 'px');
    $pipe.append($upper).append($lower);

    // Place at right edge
    var startX = flyAreaWidth; // just outside view
    $pipe.css({ transform: 'translate3d(' + startX + 'px,0,0)' });
    $flyArea.append($pipe);

    pipes.push({ el: $pipe, x: startX, gapTop: topheight, scored: false });
  }

  function updatePipes(dt){
    if(!pipes.length) return;

    var dx = pipeSpeed * dt; // distance this frame

    for(var i=0; i<pipes.length; i++){
      var p = pipes[i];
      p.x -= dx;
      p.el.css({ transform: 'translate3d(' + p.x + 'px,0,0)' });

      // Scoring: when player passes pipe right edge
      if(!p.scored && (playerX > (p.x + pipeWidth))){
        p.scored = true;
        playerScore();
      }

      // Collision check when overlapping horizontally
      var playerLeft = playerX;
      var playerRight = playerX + PLAYER_WIDTH;
      var pipeLeft = p.x;
      var pipeRight = p.x + pipeWidth;
      if(playerRight > pipeLeft && playerLeft < pipeRight){
        // Inside pipe's x-range: check y against gap
        var boxwidth = PLAYER_WIDTH - (Math.sin(Math.abs(rotation) * Math.PI / 180) * 8);
        var boxheight = (PLAYER_HEIGHT + PLAYER_HEIGHT) / 2;
        var boxleft = playerX + (PLAYER_WIDTH - boxwidth) / 2;
        var boxtop = positionY + (PLAYER_HEIGHT - boxheight) / 2;
        var boxbottom = boxtop + boxheight;
        var pipetop = p.gapTop;
        var pipebottom = p.gapTop + pipeGap;

        if(!(boxtop > pipetop && boxbottom < pipebottom)){
          // Hit the pipe
          playerDead();
          return;
        }
      }
    }

    // Remove off-screen pipes
    while(pipes.length && pipes[0].x <= -pipeWidth - 100){
      pipes[0].el.remove();
      pipes.shift();
    }
  }

  // =====================
  // Score & UI
  // =====================
  function setBigScore(erase){
    var elemscore = $("#bigscore");
    elemscore.empty();
    if(erase) return;
    var digits = score.toString().split('');
    for(var i=0; i<digits.length; i++)
      elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
  }
  function setSmallScore(){
    var elemscore = $("#currentscore");
    elemscore.empty();
    var digits = score.toString().split('');
    for(var i=0; i<digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
  }
  function setHighScore(){
    var elemscore = $("#highscore");
    elemscore.empty();
    var digits = highscore.toString().split('');
    for(var i=0; i<digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
  }
  function setMedal(){
    var elemmedal = $("#medal");
    elemmedal.empty();
    if(score < 10) return false;
    var medal = 'bronze';
    if(score >= 40) medal = 'platinum';
    else if(score >= 30) medal = 'gold';
    else if(score >= 20) medal = 'silver';
    elemmedal.append('<img src="assets/medal_' + medal + '.png" alt="' + medal + '">');
    return true;
  }

  function playerScore(){
    score += 1;
    try { soundScore.play(); } catch(e){}
    setBigScore();
  }

  function playerDead(){
    // Pause CSS background animations
    $('.animated').css('animation-play-state', 'paused')
                  .css('-webkit-animation-play-state', 'paused');

    // Enter score screen (disables further input to jump)
    currentstate = states.ScoreScreen;

    // Stop loops
    stopRaf();

    // Drop the bird visually to the floor (use transform transition)
    var playerBottom = positionY + PLAYER_HEIGHT;
    var floor = flyAreaHeight; // relative to container
    var movey = Math.max(0, landTop - playerBottom);
    var targetY = positionY + movey;

    $player.css({
      transition: 'transform 1s cubic-bezier(.645,.045,.355,1)',
      webkitTransition: 'transform 1s cubic-bezier(.645,.045,.355,1)'
    });
    var t = 'translate3d(' + playerX + 'px,' + targetY + 'px,0) rotate(90deg)';
    $player.css({ transform: t, webkitTransform: t });

    // Play sounds then show score
    if(isIncompatible.any()){
      showScore();
    } else {
      try {
        soundHit.play().bindOnce('ended', function(){
          soundDie.play().bindOnce('ended', function(){ showScore(); });
        });
      } catch(e){ showScore(); }
    }
  }

  function showScore(){
    // Unhide scoreboard
    $scoreboard.css('display','block');

    // Remove big score
    setBigScore(true);

    if(score > highscore){
      highscore = score;
      setCookie('highscore', highscore, 999);
    }

    setSmallScore();
    setHighScore();

    var wonmedal = setMedal();

    try { soundSwoosh.stop(); soundSwoosh.play(); } catch(e){}

    $scoreboard.css({ y: '40px', opacity: 0 });
    $replay.css({ y: '40px', opacity: 0 });

    $scoreboard.transition({ y: '0px', opacity: 1 }, 600, 'ease', function(){
      try { soundSwoosh.stop(); soundSwoosh.play(); } catch(e){}
      $replay.transition({ y: '0px', opacity: 1 }, 600, 'ease');
      if(wonmedal){
        $('#medal').css({ scale: 2, opacity: 0 })
                   .transition({ opacity: 1, scale: 1 }, 1200, 'ease');
      }
    });

    replayclickable = true;
  }

  $replay.on('click', function(){
    if(!replayclickable) return;
    replayclickable = false;

    try { soundSwoosh.stop(); soundSwoosh.play(); } catch(e){}

    $scoreboard.transition({ y: '-40px', opacity: 0 }, 1000, 'ease', function(){
      $scoreboard.css('display','none');
      // Reset transition on player for next round
      $player.css({ transition: '', webkitTransition: '' });
      showSplash();
    });
  });

  // =====================
  // Compatibility checks (keep original API)
  // =====================
  var isIncompatible = {
    Android: function(){ return navigator.userAgent.match(/Android/i); },
    BlackBerry: function(){ return navigator.userAgent.match(/BlackBerry/i); },
    iOS: function(){ return navigator.userAgent.match(/iPhone|iPad|iPod/i); },
    Opera: function(){ return navigator.userAgent.match(/Opera Mini/i); },
    Safari: function(){ return (navigator.userAgent.match(/OS X.*Safari/) && !navigator.userAgent.match(/Chrome/)); },
    Windows: function(){ return navigator.userAgent.match(/IEMobile/i); },
    any: function(){
      return (this.Android() || this.BlackBerry() || this.iOS() || this.Opera() || this.Safari() || this.Windows());
    }
  };

})();
