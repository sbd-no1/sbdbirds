var states = Object.freeze({
    Splash: 0,
    Playing: 1,
    Score: 2
});

var currentState = states.Splash;

var gravity = 0.25;
var jumpPower = -4.6;
var velocity = 0;
var positionY = 180;
var rotation = 0;

var flyAreaHeight;
var birdHeight;
var birdWidth;

var pipes = [];
var pipeGap = 110;
var pipeWidth = 52;
var pipeSpeed = 2;

var score = 0;
var highscore = 0;

var animationId = null;
var pipeSpawnTimer = 0;
var pipeSpawnDelay = 90; // ~1.5s @60fps

// ===== SOUNDS =====
var soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
var soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
var soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
var soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
var soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");

// =====================================

$(document).ready(function () {

    flyAreaHeight = $("#flyarea").height();
    birdHeight = $("#player").height();
    birdWidth = $("#player").width();

    showSplash();

    $(document).on("keydown", function (e) {
        if (e.keyCode === 32) handleInput();
    });

    if ("ontouchstart" in window)
        $(document).on("touchstart", handleInput);
    else
        $(document).on("mousedown", handleInput);
});

// =====================================

function showSplash() {

    currentState = states.Splash;

    velocity = 0;
    positionY = 180;
    rotation = 0;
    score = 0;

    pipes = [];
    $(".pipe").remove();

    updateBird();

    $("#splash").css("opacity", 1);
    $("#scoreboard").hide();
}

// =====================================

function startGame() {

    currentState = states.Playing;

    $("#splash").css("opacity", 0);

    pipeSpawnTimer = 0;

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);

    jump();
}

// =====================================

function gameLoop() {

    if (currentState !== states.Playing) return;

    updatePhysics();
    updatePipes();
    checkCollision();

    animationId = requestAnimationFrame(gameLoop);
}

// =====================================

function updatePhysics() {

    velocity += gravity;
    positionY += velocity;

    rotation = Math.min((velocity / 10) * 90, 90);

    var groundLimit = flyAreaHeight - birdHeight;

    if (positionY >= groundLimit) {
        positionY = groundLimit;
        die();
    }

    if (positionY <= 0) {
        positionY = 0;
        velocity = 0;
    }

    updateBird();
}

// GPU transform
function updateBird() {
    $("#player").css({
        transform: "translateY(" + positionY + "px) rotate(" + rotation + "deg)",
        willChange: "transform"
    });
}

// =====================================

function updatePipes() {

    pipeSpawnTimer++;

    if (pipeSpawnTimer > pipeSpawnDelay) {
        spawnPipe();
        pipeSpawnTimer = 0;
    }

    for (var i = 0; i < pipes.length; i++) {

        pipes[i].x -= pipeSpeed;

        pipes[i].elem.css("transform", "translateX(" + pipes[i].x + "px)");

        if (!pipes[i].passed && pipes[i].x + pipeWidth < 60) {
            pipes[i].passed = true;
            addScore();
        }
    }

    pipes = pipes.filter(p => p.x + pipeWidth > -50);
}

// =====================================

function spawnPipe() {

    var padding = 80;
    var constraint = flyAreaHeight - pipeGap - (padding * 2);
    var topHeight = Math.floor(Math.random() * constraint + padding);
    var bottomHeight = flyAreaHeight - pipeGap - topHeight;

    var pipe = $('<div class="pipe">' +
        '<div class="pipe_upper" style="height:' + topHeight + 'px;"></div>' +
        '<div class="pipe_lower" style="height:' + bottomHeight + 'px;"></div>' +
        '</div>');

    $("#flyarea").append(pipe);

    pipes.push({
        elem: pipe,
        x: $("#flyarea").width(),
        top: topHeight,
        bottom: topHeight + pipeGap,
        passed: false
    });
}

// =====================================

function checkCollision() {

    var birdLeft = $("#player").position().left;
    var birdRight = birdLeft + birdWidth;
    var birdTop = positionY;
    var birdBottom = positionY + birdHeight;

    for (var i = 0; i < pipes.length; i++) {

        var pipeLeft = pipes[i].x;
        var pipeRight = pipeLeft + pipeWidth;

        if (birdRight > pipeLeft && birdLeft < pipeRight) {

            if (birdTop < pipes[i].top || birdBottom > pipes[i].bottom) {
                die();
                return;
            }
        }
    }
}

// =====================================

function addScore() {
    score++;
    soundScore.stop();
    soundScore.play();
    setBigScore();
}

// =====================================

function die() {

    if (currentState !== states.Playing) return;

    currentState = states.Score;

    cancelAnimationFrame(animationId);

    soundHit.play().bindOnce("ended", function () {
        soundDie.play().bindOnce("ended", function () {
            showScore();
        });
    });
}

// =====================================

function showScore() {

    $("#scoreboard").show();
}

// =====================================

function handleInput() {

    if (currentState === states.Splash) {
        startGame();
    }
    else if (currentState === states.Playing) {
        jump();
    }
}

function jump() {
    velocity = jumpPower;
    soundJump.stop();
    soundJump.play();
}
