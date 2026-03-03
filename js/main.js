var debugmode = false;

var states = Object.freeze({
   SplashScreen: 0,
   GameScreen: 1,
   ScoreScreen: 2
});

var currentstate;

var gravity = 0.25;
var velocity = 0;
var position = 180;
var rotation = 0;
var jump = -4.6;
var flyArea = $("#flyarea").height();

var landTop;
var ceilingBottom;

var playerWidth = 34.0;
var playerHeight = 24.0;

var score = 0;
var highscore = 0;

var pipeheight = 110;
var pipewidth = 52;
var pipes = [];

var replayclickable = false;

// sounds
var volume = 30;
var soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");
buzz.all().setVolume(volume);

var loopGameloop;
var loopPipeloop;

$(document).ready(function() {

   flyArea = $("#flyarea").height();

   if(window.location.search == "?debug")
      debugmode = true;

   if(window.location.search == "?easy")
      pipeheight = 200;

   var savedscore = getCookie("highscore");
   if(savedscore != "")
      highscore = parseInt(savedscore);

   showSplash();
});

function showSplash()
{
   currentstate = states.SplashScreen;

   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;

   $("#player").css({ transform: "translateY(0px) rotate(0deg)" });

   soundSwoosh.stop();
   soundSwoosh.play();

   $(".pipe").remove();
   pipes = [];

   $(".animated").css('animation-play-state', 'running');
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');
}

function startGame()
{
   currentstate = states.GameScreen;

   $("#splash").stop();
   $("#splash").transition({ opacity: 0 }, 500, 'ease');

   landTop = $("#land").offset().top;
   ceilingBottom = $("#ceiling").offset().top + $("#ceiling").height();

   setBigScore();

   if(debugmode)
      $(".boundingbox").show();

   startGameLoop();
   loopPipeloop = setInterval(updatePipes, 1400);

   playerJump();
}

function startGameLoop() {
   function loop() {
      gameloop();
      loopGameloop = requestAnimationFrame(loop);
   }
   loopGameloop = requestAnimationFrame(loop);
}

function stopGameLoop() {
   cancelAnimationFrame(loopGameloop);
   clearInterval(loopPipeloop);
   loopGameloop = null;
   loopPipeloop = null;
}

function updatePlayer()
{
   rotation = Math.min((velocity / 10) * 90, 90);

   $("#player").css({
      transform: "translateY(" + position + "px) rotate(" + rotation + "deg)"
   });
}

function gameloop()
{
   velocity += gravity;
   position += velocity;

   updatePlayer();

   var boxleft = 60;
   var boxtop = position;
   var boxright = boxleft + playerWidth;
   var boxbottom = boxtop + playerHeight;

   if(boxbottom >= landTop)
   {
      playerDead();
      return;
   }

   if(boxtop <= ceilingBottom)
      position = 0;

   if(pipes[0] == null)
      return;

   var nextpipe = pipes[0];
   var nextpipeupper = nextpipe.children(".pipe_upper");

   var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
   var pipeleft = nextpipeupper.offset().left - 2;
   var piperight = pipeleft + pipewidth;
   var pipebottom = pipetop + pipeheight;

   if(boxright > pipeleft)
   {
      if(!(boxtop > pipetop && boxbottom < pipebottom))
      {
         playerDead();
         return;
      }
   }

   if(boxleft > piperight)
   {
      pipes.splice(0, 1);
      playerScore();
   }
}

function playerJump()
{
   velocity = jump;
   soundJump.stop();
   soundJump.play();
}

function playerDead()
{
   $(".animated").css('animation-play-state', 'paused');

   var playerbottom = position + playerWidth;
   var floor = flyArea;
   var movey = Math.max(0, floor - playerbottom);

   $("#player").transition(
      { transform: "translateY(" + (position + movey) + "px) rotate(90deg)" },
      1000,
      'easeInOutCubic'
   );

   currentstate = states.ScoreScreen;

   stopGameLoop();

   if(isIncompatible.any())
      showScore();
   else
   {
      soundHit.play().bindOnce("ended", function() {
         soundDie.play().bindOnce("ended", function() {
            showScore();
         });
      });
   }
}

function playerScore()
{
   score += 1;
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

function updatePipes()
{
   $(".pipe").filter(function() {
      return $(this).position().left <= -100;
   }).remove();

   var padding = 80;
   var constraint = flyArea - pipeheight - (padding * 2);
   var topheight = Math.floor((Math.random() * constraint) + padding);
   var bottomheight = (flyArea - pipeheight) - topheight;

   var newpipe = $('<div class="pipe animated">' +
      '<div class="pipe_upper" style="height: ' + topheight + 'px;"></div>' +
      '<div class="pipe_lower" style="height: ' + bottomheight + 'px;"></div>' +
      '</div>');

   $("#flyarea").append(newpipe);
   pipes.push(newpipe);
}

$("#replay").click(function() {
   if(!replayclickable) return;
   replayclickable = false;

   soundSwoosh.stop();
   soundSwoosh.play();

   $("#scoreboard").transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      $("#scoreboard").css("display", "none");
      showSplash();
   });
});
// Handle space bar
$(document).keydown(function(e){
   // space bar!
   if(e.keyCode == 32)
   {
      // in ScoreScreen, hitting space should click the "replay" button.
      if(currentstate == states.ScoreScreen)
         $("#replay").click();
      else
         screenClick();
   }
});
