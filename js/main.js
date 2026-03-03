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

var flyArea;
var landTop;

var score = 0;
var highscore = 0;

var pipeheight = 110;
var pipewidth = 52;
var pipes = [];

var replayclickable = false;

// ===== SOUNDS =====
var volume = 30;
var soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");
buzz.all().setVolume(volume);

// ===== LOOP CONTROL =====
var animationId = null;
var pipeTimer = 0;
var pipeIntervalFrames = 90; // ~1.5s @60fps

// =========================================

$(document).ready(function () {

   flyArea = $("#flyarea").height();
   landTop = $("#land").position().top;

   var savedscore = getCookie("highscore");
   if (savedscore != "")
      highscore = parseInt(savedscore);

   showSplash();
});

// =========================================
// UTIL
// =========================================

function getCookie(cname) {
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for (var i = 0; i < ca.length; i++) {
      var c = ca[i].trim();
      if (c.indexOf(name) == 0)
         return c.substring(name.length, c.length);
   }
   return "";
}

function setCookie(cname, cvalue, exdays) {
   var d = new Date();
   d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
   var expires = "expires=" + d.toGMTString();
   document.cookie = cname + "=" + cvalue + "; " + expires;
}

// =========================================
// SPLASH
// =========================================

function showSplash() {

   currentstate = states.SplashScreen;

   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;

   pipes = [];
   $(".pipe").remove();

   updatePlayer();

   soundSwoosh.stop();
   soundSwoosh.play();

   $(".animated").css('animation-play-state', 'running');

   $("#splash").css({ opacity: 1 });
}

// =========================================
// START GAME
// =========================================

function startGame() {

   currentstate = states.GameScreen;

   $("#splash").css({ opacity: 0 });

   setBigScore();

   pipeTimer = 0;

   cancelAnimationFrame(animationId);
   animationId = requestAnimationFrame(gameLoop);

   playerJump();
}

// =========================================
// RAF LOOP
// =========================================

function gameLoop() {

   if (currentstate !== states.GameScreen) return;

   updatePhysics();
   updatePipesMovement();
   checkCollision();

   animationId = requestAnimationFrame(gameLoop);
}

// =========================================
// PHYSICS
// =========================================

function updatePhysics() {

   velocity += gravity;
   position += velocity;

   rotation = Math.min((velocity / 10) * 90, 90);

   updatePlayer();

   // Ground
   if (position >= landTop - 24) {
      position = landTop - 24;
      playerDead();
   }

   // Ceiling
   if (position <= 0) {
      position = 0;
      velocity = 0;
   }
}

// =========================================
// GPU UPDATE PLAYER
// =========================================

function updatePlayer() {

   $("#player").css({
      transform: "translateY(" + position + "px) rotate(" + rotation + "deg)",
      willChange: "transform"
   });
}

// =========================================
// PIPE LOGIC (JS MOVEMENT - NO CSS ANIMATION)
// =========================================

function updatePipesMovement() {

   pipeTimer++;

   if (pipeTimer > pipeIntervalFrames) {
      spawnPipe();
      pipeTimer = 0;
   }

   for (var i = 0; i < pipes.length; i++) {

      pipes[i].x -= 2;
      pipes[i].elem.css("transform", "translateX(" + pipes[i].x + "px)");

      // Score
      if (!pipes[i].passed && pipes[i].x + pipewidth < 60) {
         pipes[i].passed = true;
         playerScore();
      }
   }

   pipes = pipes.filter(p => p.x + pipewidth > -50);
}

// =========================================
// SPAWN PIPE
// =========================================

function spawnPipe() {

   var padding = 80;
   var constraint = flyArea - pipeheight - (padding * 2);
   var topheight = Math.floor((Math.random() * constraint) + padding);
   var bottomheight = (flyArea - pipeheight) - topheight;

   var newpipe = $('<div class="pipe">' +
      '<div class="pipe_upper" style="height:' + topheight + 'px;"></div>' +
      '<div class="pipe_lower" style="height:' + bottomheight + 'px;"></div>' +
      '</div>');

   $("#flyarea").append(newpipe);

   pipes.push({
      elem: newpipe,
      x: $("#flyarea").width(),
      top: topheight,
      bottom: topheight + pipeheight,
      passed: false
   });
}

// =========================================
// COLLISION (PURE MATH, NO OFFSET)
// =========================================

function checkCollision() {

   var birdLeft = 60;
   var birdRight = birdLeft + 34;
   var birdTop = position;
   var birdBottom = position + 24;

   for (var i = 0; i < pipes.length; i++) {

      var pipeLeft = pipes[i].x;
      var pipeRight = pipeLeft + pipewidth;

      if (birdRight > pipeLeft && birdLeft < pipeRight) {

         if (birdTop < pipes[i].top || birdBottom > pipes[i].bottom) {
            playerDead();
            return;
         }
      }
   }
}

// =========================================
// SCORE
// =========================================

function playerScore() {
   score++;
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

// =========================================
// DEAD
// =========================================

function playerDead() {

   currentstate = states.ScoreScreen;

   cancelAnimationFrame(animationId);

   $(".animated").css('animation-play-state', 'paused');

   soundHit.play().bindOnce("ended", function () {
      soundDie.play().bindOnce("ended", function () {
         showScore();
      });
   });
}

// =========================================
// SCOREBOARD (GIỮ NGUYÊN)
// =========================================

function showScore() {

   $("#scoreboard").css("display", "block");

   if (score > highscore) {
      highscore = score;
      setCookie("highscore", highscore, 999);
   }

   setSmallScore();
   setHighScore();
   setMedal();

   replayclickable = true;
}

// =========================================
// INPUT
// =========================================

$(document).keydown(function (e) {
   if (e.keyCode == 32) {
      screenClick();
   }
});

if ("ontouchstart" in window)
   $(document).on("touchstart", screenClick);
else
   $(document).on("mousedown", screenClick);

function screenClick() {

   if (currentstate == states.GameScreen) {
      playerJump();
   }
   else if (currentstate == states.SplashScreen) {
      startGame();
   }
}

function playerJump() {
   velocity = jump;
   soundJump.stop();
   soundJump.play();
}
