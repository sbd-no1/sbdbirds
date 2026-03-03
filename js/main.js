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

var score = 0;
var highscore = 0;

var pipeheight = 110;
var pipewidth = 52;
var pipes = new Array();

var replayclickable = false;

//sounds
var volume = 30;
var soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");
buzz.all().setVolume(volume);

//loops
var loopGameloop;
var loopPipeloop;

$(document).ready(function() {
   if(window.location.search == "?debug")
      debugmode = true;
   if(window.location.search == "?easy")
      pipeheight = 200;

   //get the highscore
   var savedscore = getCookie("highscore");
   if(savedscore != "")
      highscore = parseInt(savedscore);

   //start with the splash screen
   showSplash();
});

function getCookie(cname)
{
   var name = cname + "=";
   var ca = document.cookie.split(';');
   for(var i=0; i<ca.length; i++)
   {
      var c = ca[i].trim();
      if (c.indexOf(name)==0) return c.substring(name.length,c.length);
   }
   return "";
}

function setCookie(cname,cvalue,exdays)
{
   var d = new Date();
   d.setTime(d.getTime()+(exdays*24*60*60*1000));
   var expires = "expires="+d.toGMTString();
   document.cookie = cname + "=" + cvalue + "; " + expires;
}

function showSplash()
{
   currentstate = states.SplashScreen;

   //set the defaults (again)
   velocity = 0;
   position = 180;
   rotation = 0;
   score = 0;

   //update the player in preparation for the next game
   $("#player").css({ y: 0, x: 0 });
   updatePlayer($("#player"));

   soundSwoosh.stop();
   soundSwoosh.play();

   //clear out all the pipes if there are any
   $(".pipe").remove();
   pipes = new Array();

   //make everything animated again
   $(".animated").css('animation-play-state', 'running');
   $(".animated").css('-webkit-animation-play-state', 'running');

   //fade in the splash
   $("#splash").transition({ opacity: 1 }, 2000, 'ease');
}

function startGame() {
   currentstate = states.GameScreen;
   $("#splash").stop().transition({ opacity: 0 }, 500, 'ease');
   setBigScore();

   // Khởi tạo vòng lặp mượt mà thay cho setInterval
   loopGameloop = window.requestAnimationFrame(gameloop);
   loopPipeloop = setInterval(updatePipes, 1400);

   playerJump();
}

function updatePlayer(player)
{
   // Tính toán góc quay dựa trên vận tốc
   rotation = Math.min((velocity / 10) * 90, 90);

   // TỐI ƯU: Dùng transform3d để mượt hơn trên iOS
   $(player).css({ 
      'transform': 'translate3d(0, ' + position + 'px, 0) rotate(' + rotation + 'deg)',
      'top': 0 
   });
}

function gameloop() {
   var player = $("#player");

   // Cập nhật vật lý rơi tự do
   velocity += gravity;
   position += velocity;

   // Cập nhật vị trí chim lên màn hình
   updatePlayer(player);

   // TỐI ƯU: Kiểm tra va chạm đất bằng biến số thay vì đo DOM
   if(position + 24 >= $("#land").offset().top) // 24 là chiều cao chim
   {
      playerDead();
      return;
   }

   // Chống bay quá trần
   if(position <= 0)
      position = 0;

   // Nếu chưa có ống thì bỏ qua phần dưới
   if(pipes[0] == null) {
      // Tiếp tục vòng lặp nếu đang chơi
      if(currentstate == states.GameScreen)
         loopGameloop = window.requestAnimationFrame(gameloop);
      return;
   }

   // Kiểm tra va chạm với ống
   var nextpipe = pipes[0];
   var nextpipeupper = nextpipe.children(".pipe_upper");

   var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
   var pipeleft = nextpipeupper.offset().left - 2;
   var piperight = pipeleft + pipewidth;
   var pipebottom = pipetop + pipeheight;

   var birdRight = 50 + 34; // 50 là tọa độ left mặc định, 34 là chiều rộng chim
   var birdLeft = 50;

   if(birdRight > pipeleft)
   {
      // Nếu chim không nằm giữa khoảng trống của 2 ống -> Chết
      if(!(position > pipetop && (position + 24) < pipebottom))
      {
         playerDead();
         return;
      }
   }

   // Qua ống thành công
   if(birdLeft > piperight)
   {
      pipes.splice(0, 1);
      playerScore();
   }

   // QUAN TRỌNG: Gọi khung hình tiếp theo để mượt như nhung
   if(currentstate == states.GameScreen)
      loopGameloop = window.requestAnimationFrame(gameloop);
}

   //have we passed the imminent danger?
   if(boxleft > piperight)
   {
      //yes, remove it
      pipes.splice(0, 1);

      //and score a point
      playerScore();
   }
}

//Handle space bar
$(document).keydown(function(e){
   //space bar!
   if(e.keyCode == 32)
   {
      //in ScoreScreen, hitting space should click the "replay" button. else it's just a regular spacebar hit
      if(currentstate == states.ScoreScreen)
         $("#replay").click();
      else
         screenClick();
   }
});

//Handle mouse down OR touch start
if("ontouchstart" in window)
   $(document).on("touchstart", screenClick);
else
   $(document).on("mousedown", screenClick);

function screenClick()
{
   if(currentstate == states.GameScreen)
   {
      playerJump();
   }
   else if(currentstate == states.SplashScreen)
   {
      startGame();
   }
}

function playerJump()
{
   velocity = jump;
   //play jump sound
   soundJump.stop();
   soundJump.play();
}

function setBigScore(erase)
{
   var elemscore = $("#bigscore");
   elemscore.empty();

   if(erase)
      return;

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore()
{
   var elemscore = $("#currentscore");
   elemscore.empty();

   var digits = score.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setHighScore()
{
   var elemscore = $("#highscore");
   elemscore.empty();

   var digits = highscore.toString().split('');
   for(var i = 0; i < digits.length; i++)
      elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setMedal()
{
   var elemmedal = $("#medal");
   elemmedal.empty();

   if(score < 10)
      //signal that no medal has been won
      return false;

   if(score >= 10)
      medal = "bronze";
   if(score >= 20)
      medal = "silver";
   if(score >= 30)
      medal = "gold";
   if(score >= 40)
      medal = "platinum";

   elemmedal.append('<img src="assets/medal_' + medal +'.png" alt="' + medal +'">');

   //signal that a medal has been won
   return true;
}

function playerDead() {
   // Ngừng tất cả hiệu ứng CSS
   $(".animated").css('animation-play-state', 'paused');
   $(".animated").css('-webkit-animation-play-state', 'paused');

   // Rơi xuống đất khi chết
   var playerbottom = position + 24;
   var movey = Math.max(0, 420 - playerbottom);
   $("#player").transition({ y: movey + 'px', rotate: 90}, 1000, 'easeInOutCubic');

   currentstate = states.ScoreScreen;

   // TỐI ƯU: Dừng vòng lặp requestAnimationFrame
   window.cancelAnimationFrame(loopGameloop);
   clearInterval(loopPipeloop);
   
   loopGameloop = null;
   loopPipeloop = null;

   if (isIncompatible.any()) {
      showScore();
   } else {
      soundHit.play().bindOnce("ended", function() {
         soundDie.play().bindOnce("ended", function() {
            showScore();
         });
      });
   }
}

function showScore()
{
   //unhide us
   $("#scoreboard").css("display", "block");

   //remove the big score
   setBigScore(true);

   //have they beaten their high score?
   if(score > highscore)
   {
      //yeah!
      highscore = score;
      //save it!
      setCookie("highscore", highscore, 999);
   }

   //update the scoreboard
   setSmallScore();
   setHighScore();
   var wonmedal = setMedal();

   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //show the scoreboard
   $("#scoreboard").css({ y: '40px', opacity: 0 }); //move it down so we can slide it up
   $("#replay").css({ y: '40px', opacity: 0 });
   $("#scoreboard").transition({ y: '0px', opacity: 1}, 600, 'ease', function() {
      //When the animation is done, animate in the replay button and SWOOSH!
      soundSwoosh.stop();
      soundSwoosh.play();
      $("#replay").transition({ y: '0px', opacity: 1}, 600, 'ease');

      //also animate in the MEDAL! WOO!
      if(wonmedal)
      {
         $("#medal").css({ scale: 2, opacity: 0 });
         $("#medal").transition({ opacity: 1, scale: 1 }, 1200, 'ease');
      }
   });

   //make the replay button clickable
   replayclickable = true;
}

$("#replay").click(function() {
   //make sure we can only click once
   if(!replayclickable)
      return;
   else
      replayclickable = false;
   //SWOOSH!
   soundSwoosh.stop();
   soundSwoosh.play();

   //fade out the scoreboard
   $("#scoreboard").transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      //when that's done, display us back to nothing
      $("#scoreboard").css("display", "none");

      //start the game over!
      showSplash();
   });
});

function playerScore()
{
   score += 1;
   //play score sound
   soundScore.stop();
   soundScore.play();
   setBigScore();
}

function updatePipes()
{
   //Do any pipes need removal?
   $(".pipe").filter(function() { return $(this).position().left <= -100; }).remove()

   //add a new pipe (top height + bottom height  + pipeheight == flyArea) and put it in our tracker
   var padding = 80;
   var constraint = flyArea - pipeheight - (padding * 2); //double padding (for top and bottom)
   var topheight = Math.floor((Math.random()*constraint) + padding); //add lower padding
   var bottomheight = (flyArea - pipeheight) - topheight;
   var newpipe = $('<div class="pipe animated"><div class="pipe_upper" style="height: ' + topheight + 'px;"></div><div class="pipe_lower" style="height: ' + bottomheight + 'px;"></div></div>');
   $("#flyarea").append(newpipe);
   pipes.push(newpipe);
}

var isIncompatible = {
   Android: function() {
   return navigator.userAgent.match(/Android/i);
   },
   BlackBerry: function() {
   return navigator.userAgent.match(/BlackBerry/i);
   },
   iOS: function() {
   return navigator.userAgent.match(/iPhone|iPad|iPod/i);
   },
   Opera: function() {
   return navigator.userAgent.match(/Opera Mini/i);
   },
   Safari: function() {
   return (navigator.userAgent.match(/OS X.*Safari/) && ! navigator.userAgent.match(/Chrome/));
   },
   Windows: function() {
   return navigator.userAgent.match(/IEMobile/i);
   },
   any: function() {
   return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() || isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
   }
};
