// =====================
// STATE
// =====================
const STATE = {
    SPLASH: 0,
    PLAYING: 1,
    SCORE: 2
};

let currentState = STATE.SPLASH;

// =====================
// GAME VAR
// =====================
let gravity = 0.25;
let jumpPower = -4.6;
let velocity = 0;
let positionY = 180;
let rotation = 0;

let flyAreaHeight;
let flyAreaWidth;

let birdHeight;
let birdWidth;
let birdX;

let pipes = [];
let pipeGap = 110;
let pipeWidth = 52;
let pipeSpeed = 2;

let score = 0;

let animationId = null;
let pipeTimer = 0;
let pipeSpawnDelay = 90; // ~1.5s

// =====================
// SOUND
// =====================
let soundJump = new buzz.sound("assets/sounds/sfx_wing.ogg");
let soundScore = new buzz.sound("assets/sounds/sfx_point.ogg");
let soundHit = new buzz.sound("assets/sounds/sfx_hit.ogg");
let soundDie = new buzz.sound("assets/sounds/sfx_die.ogg");
let soundSwoosh = new buzz.sound("assets/sounds/sfx_swooshing.ogg");

// =====================
// INIT
// =====================
$(document).ready(function () {

    flyAreaHeight = $("#flyarea").height();
    flyAreaWidth = $("#flyarea").width();

    birdHeight = $("#player").height();
    birdWidth = $("#player").width();
    birdX = $("#player").position().left;

    bindInput();
    showSplash();
});

// =====================
// INPUT (ỔN ĐỊNH iOS)
// =====================
function bindInput() {

    const fly = document.getElementById("flyarea");

    fly.addEventListener("touchstart", function (e) {
        e.preventDefault();
        handleInput();
    }, { passive: false });

    fly.addEventListener("mousedown", function () {
        handleInput();
    });

    document.addEventListener("keydown", function (e) {
        if (e.code === "Space") handleInput();
    });
}

function handleInput() {

    if (currentState === STATE.SPLASH) {
        startGame();
    }
    else if (currentState === STATE.PLAYING) {
        jump();
    }
    else if (currentState === STATE.SCORE) {
        showSplash();
    }
}

// =====================
// SPLASH
// =====================
function showSplash() {

    currentState = STATE.SPLASH;

    velocity = 0;
    positionY = 180;
    rotation = 0;
    score = 0;

    pipes = [];
    $(".pipe").remove();

    updateBird();

    $("#scoreboard").hide();
    $("#splash").css("opacity", 1);
}

// =====================
// START
// =====================
function startGame() {

    currentState = STATE.PLAYING;

    $("#splash").css("opacity", 0);

    pipeTimer = 0;

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);

    jump();
}

// =====================
// LOOP
// =====================
function gameLoop() {

    if (currentState !== STATE.PLAYING) return;

    updatePhysics();
    updatePipes();
    checkCollision();

    animationId = requestAnimationFrame(gameLoop);
}

// =====================
// PHYSICS
// =====================
function updatePhysics() {

    velocity += gravity;
    positionY += velocity;

    rotation = Math.min((velocity / 10) * 90, 90);

    const groundLimit = flyAreaHeight - birdHeight;

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
        transform: "translateY(" + positionY + "px) rotate(" + rotation + "deg)"
    });
}

// =====================
// PIPE
// =====================
function updatePipes() {

    pipeTimer++;

    if (pipeTimer > pipeSpawnDelay) {
        spawnPipe();
        pipeTimer = 0;
    }

    for (let i = 0; i < pipes.length; i++) {

        pipes[i].x -= pipeSpeed;
        pipes[i].elem.css("transform", "translateX(" + pipes[i].x + "px)");

        if (!pipes[i].passed && pipes[i].x + pipeWidth < birdX) {
            pipes[i].passed = true;
            addScore();
        }
    }

    pipes = pipes.filter(p => p.x + pipeWidth > -60);
}

function spawnPipe() {

    let padding = 80;
    let constraint = flyAreaHeight - pipeGap - padding * 2;
    let topHeight = Math.floor(Math.random() * constraint + padding);
    let bottomHeight = flyAreaHeight - pipeGap - topHeight;

    let pipe = $('<div class="pipe">' +
        '<div class="pipe_upper" style="height:' + topHeight + 'px;"></div>' +
        '<div class="pipe_lower" style="height:' + bottomHeight + 'px;"></div>' +
        '</div>');

    $("#flyarea").append(pipe);

    pipes.push({
        elem: pipe,
        x: flyAreaWidth,
        top: topHeight,
        bottom: topHeight + pipeGap,
        passed: false
    });
}

// =====================
// COLLISION
// =====================
function checkCollision() {

    let birdLeft = birdX;
    let birdRight = birdX + birdWidth;
    let birdTop = positionY;
    let birdBottom = positionY + birdHeight;

    for (let i = 0; i < pipes.length; i++) {

        let pipeLeft = pipes[i].x;
        let pipeRight = pipeLeft + pipeWidth;

        if (birdRight > pipeLeft && birdLeft < pipeRight) {

            if (birdTop < pipes[i].top || birdBottom > pipes[i].bottom) {
                die();
                return;
            }
        }
    }
}

// =====================
// SCORE
// =====================
function addScore() {
    score++;
    soundScore.stop();
    soundScore.play();
    setBigScore();
}

// =====================
// DIE
// =====================
function die() {

    if (currentState !== STATE.PLAYING) return;

    currentState = STATE.SCORE;

    cancelAnimationFrame(animationId);

    soundHit.play().bindOnce("ended", function () {
        soundDie.play();
        $("#scoreboard").show();
    });
}

// =====================
// JUMP
// =====================
function jump() {

    if (currentState !== STATE.PLAYING) return;

    velocity = jumpPower;
    soundJump.stop();
    soundJump.play();
}
