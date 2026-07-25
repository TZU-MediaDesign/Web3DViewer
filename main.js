// ---- config.js の内容をシーンに反映 ----
const CONFIG = VIEWER_CONFIG;
const HOME   = CONFIG.cameraHome;

document.title = CONFIG.pageTitle;
document.getElementById('title').innerHTML = CONFIG.displayTitle.join('<br>');

const modelEntity = document.getElementById('model-entity');
modelEntity.setAttribute('gltf-model', `Assets/${CONFIG.modelFile}`);

const scene = document.getElementById('scene');
scene.setAttribute('fog', `type: linear; color: ${CONFIG.fogColor}; near: ${CONFIG.fogNear}; far: ${CONFIG.fogFar}`);

// ---- 背景（単色 or 360°パノラマ画像） ----
if (CONFIG.backgroundType === 'image' && CONFIG.backgroundImage) {
    const skyTexture = document.createElement('img');
    skyTexture.setAttribute('id', 'sky-texture');
    skyTexture.setAttribute('crossorigin', 'anonymous');
    skyTexture.setAttribute('src', `Assets/${CONFIG.backgroundImage}`);
    document.querySelector('a-assets').appendChild(skyTexture);

    const sky = document.getElementById('sky');
    sky.setAttribute('src', '#sky-texture');
    sky.setAttribute('visible', 'true');
} else {
    scene.setAttribute('background', `color: ${CONFIG.backgroundColor}`);
}

// ---- モデルの位置・回転・拡縮 ----
const mp = CONFIG.modelPosition, mr = CONFIG.modelRotation, ms = CONFIG.modelScale;
modelEntity.setAttribute('position', `${mp.x} ${mp.y} ${mp.z}`);
modelEntity.setAttribute('rotation', `${mr.x} ${mr.y} ${mr.z}`);
modelEntity.setAttribute('scale', `${ms.x} ${ms.y} ${ms.z}`);

// ---- glTFアニメーションの再生 ----
// animation-mixer は tick ごとに再生を進めるだけで、視点操作（ドラッグ／ジャイロ／自動オービット／
// リセット）とは独立して動作するため、ユーザー操作中も常にアニメーションが再生され続ける。
const animBtn      = document.getElementById('anim-btn');
const iconPause    = document.getElementById('icon-pause');
const iconPlay     = document.getElementById('icon-play');
let animPaused     = false;

if (CONFIG.playAnimations) {
    modelEntity.setAttribute('animation-mixer', `clip: ${CONFIG.animationClip || '*'}; loop: ${CONFIG.animationLoop}; timeScale: ${CONFIG.animationTimeScale}`);

    animBtn.style.display = '';
    animBtn.addEventListener('click', () => {
        animPaused = !animPaused;
        modelEntity.setAttribute('animation-mixer', 'timeScale', animPaused ? 0 : CONFIG.animationTimeScale);
        iconPause.style.display = animPaused ? 'none' : '';
        iconPlay.style.display  = animPaused ? ''     : 'none';
        animBtn.title = animPaused ? 'アニメーションを再生' : 'アニメーションを一時停止';
    });
}

// ---- 読み込み中表示 ----
const loadingOverlay = document.getElementById('loading-overlay');
document.getElementById('loading-text').textContent = CONFIG.loadingText;
if (!CONFIG.loadingText) {
    loadingOverlay.classList.add('hidden');
}
modelEntity.addEventListener('model-loaded', () => loadingOverlay.classList.add('hidden'));
modelEntity.addEventListener('model-error', () => loadingOverlay.classList.add('hidden'));

// ---- 裏面の描画設定 ----
if (CONFIG.cullBackfaces) {
    modelEntity.addEventListener('model-loaded', () => {
        const mesh = modelEntity.getObject3D('mesh');
        if (!mesh) return;
        mesh.traverse(node => {
            if (!node.isMesh || !node.material) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(mat => { mat.side = THREE.FrontSide; });
        });
    });
}

// ---- AR/VR表示ボタン（対応端末・ブラウザのみ、それぞれ独立に表示） ----
// vr-mode-ui のA-Frame標準ボタンは使わず、AR/VRとも同じ仕組み・同じ見た目の自前ボタンで統一する
// （標準ボタンだと画面右下で自前のボタン群と重なって隠れてしまうため）
if (CONFIG.enableWebAR && navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar').then(supported => {
        if (!supported) return;
        const arBtn = document.getElementById('ar-btn');
        arBtn.style.display = '';
        arBtn.addEventListener('click', () => scene.enterAR());
    }).catch(() => {});
}
if (CONFIG.enableWebVR && navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        if (!supported) return;
        const vrBtn = document.getElementById('vr-btn');
        vrBtn.style.display = '';
        vrBtn.addEventListener('click', () => scene.enterVR());
    }).catch(() => {});
}

// ---- マーカーAR（ar-marker.html）への導線ボタン ----
// AR.js（カメラ映像＋マーカー認識）を使うため、背面カメラを持つモバイル端末での機能とする。
// PC等（マウス操作＝pointer: fine）では意味をなさないので、タッチ端末のみ表示する。
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
if (CONFIG.markerAR && CONFIG.markerAR.enableButton && isTouchDevice) {
    const markerArBtn = document.getElementById('marker-ar-btn');
    if (markerArBtn) markerArBtn.style.display = '';
}

// ---- AR/VRモードに入ったときの視点調整 ----
// AR/VRセッション中はXR機器の実際の位置・向きがそのままカメラ（camera-rig）に反映され、
// 通常モードのカメラ位置（cameraHome、orbit-controls経由の位置）は使われなくなる。
// camera-rig の位置・向きはXR機器のトラッキングに完全に委ね、書き換えない。
// これにより、現実空間に固定された（world-locked）モデルの周りを、端末を持って実際に
// 動くことで横からのぞき込む——といった動作が成立する（端末が位置トラッキングに対応している場合）。
// camera-rig を包む xr-rig（親エンティティ）の位置を「XRトラッキング空間の原点オフセット」
// として使い、AR/VRに入った瞬間だけ CONFIG.xrCameraPosition を適用する。
const xrPos = CONFIG.xrCameraPosition;
scene.addEventListener('enter-vr', () => {
    // XR中は自動オービット・アイドル・ジャイロを止める。これらは毎フレーム camera-rig の位置を
    // 直接書き換えるため、動かしたままだとXR機器のトラッキング姿勢を上書きしてしまい、
    // 「現実空間で動いても視点が動かない／操作できない」原因になる。
    inXR = true;
    disableGyro();
    stopIdle();
    clearTimeout(idleTimer);

    xrRig.setAttribute('position', `${xrPos.x} ${xrPos.y} ${xrPos.z}`);

    if (!scene.is('ar-mode')) {
        // VR: 前後左右の移動をタッチ（仮想スティック）/キーボードで行えるようにする。
        // camera-rig ではなく xr-rig（オフセット用の親）に付与することで、XR機器の実際の
        // トラッキング位置（camera-rigのローカル姿勢）と競合しない。端末が位置トラッキング
        // に対応していれば、実際に持って歩いた分の移動もそのまま重ねて反映される
        xrRig.setAttribute('movement-controls', 'controls: touch, keyboard; fly: false');
    }
});

scene.addEventListener('exit-vr', () => {
    inXR = false;
    xrRig.setAttribute('position', '0 0 0');
    xrRig.removeAttribute('movement-controls');

    // camera-rig の位置・向きはXR機器のトラッキングに委ねていたため、セッション終了時点では
    // 設定したホーム位置とは無関係な値が残っている。通常モードに戻ったら、その場の値を一度きり
    // 書き換えるだけだとA-Frameのセッション後処理に上書きされて原点に残ることがあるため、
    // アニメーションで数フレームかけてホーム視点へ確実に戻す（原点に取り残されるのを防ぐ）。
    animateToHome(0.08);
});

// ---- 端末の向きで視点操作するボタン（対応端末のみ表示） ----
const gyroBtn = document.getElementById('gyro-btn');
if (CONFIG.enableDeviceOrientation && window.DeviceOrientationEvent && window.matchMedia('(pointer: coarse)').matches) {
    gyroBtn.style.display = '';
    gyroBtn.addEventListener('click', () => {
        if (gyroActive) {
            disableGyro();
        } else {
            requestGyroPermission().then(state => {
                if (state === 'granted') enableGyro();
            }).catch(() => {});
        }
    });
}

const xrRig = document.getElementById('xr-rig');
const rig   = document.getElementById('camera-rig');
rig.setAttribute('orbit-controls', `
    target: ${HOME.tx} ${HOME.ty} ${HOME.tz};
    minDistance: 2;
    maxDistance: 80;
    initialPosition: ${HOME.px} ${HOME.py} ${HOME.pz};
    enableDamping: true;
    dampingFactor: 0.08;
    rotateSpeed: 0.6;
    zoomSpeed: 1.2;
    enablePan: true;
    panSpeed: 0.8;
    enableZoom: true;
    screenSpacePanning: true;
    autoRotate: false;
    autoRotateSpeed: 0.6;
    minPolarAngle: 8;
    maxPolarAngle: 172`);

const ORBIT_DELAY = CONFIG.idleOrbitDelaySec;  // 無操作後に自動回転を開始するまでの秒数
const RESET_DELAY = CONFIG.idleResetDelaySec;  // 無操作後に視点をリセットするまでの秒数

const explorePrompt = document.getElementById('explore-prompt');

let idleTimer         = null;
let resetTimer        = null;
let exploreTimer      = null;
let isIdle            = false;
let isResetting       = false;
let idleReturnHome    = false; // 無操作が長く続いた後、ホーム視点へなめらかに戻している最中か
let userHasInteracted = false;
let resetAnim         = null;
let inXR              = false; // AR/VRセッション中か（trueの間は自動オービット等でカメラを書き換えない）

// オービット用の球面座標（null = 次の idle 開始時に再初期化）
let orbitTheta = null;
let orbitR     = null;
let orbitPhi   = null;

// オービットの水平回転・仰角変化の「現在速度」と、なめらかに近づけていく「目標速度」
// 水平回転（テーマ）は「向き・速さ」を長い間隔でしか選び直さないことで、狭い範囲での
// 反復運動ではなく、モデルの全周が見えるくらい大きく周回する。仰角はこれまで通り
// 短い間隔でゆらいで生き生きとした見た目にする。
let orbitThetaSpeed      = 0;
let orbitThetaSpeedGoal  = 0;
let orbitPhiSpeed        = 0;
let orbitPhiSpeedGoal    = 0;
let orbitLastTime        = null; // 前フレームのtimestamp（秒）。dt算出用
let orbitThetaRetargetAt = 0;    // 次に水平回転の向き・速さを選び直すtimestamp（秒）
let orbitPhiRetargetAt   = 0;    // 次に仰角の速さを選び直すtimestamp（秒）

const DEG2RAD = Math.PI / 180;

// ホーム視点を球面座標（注視点からの距離・仰角）に変換しておく。
// 無操作が続いた際、水平回転は継続したまま、ズーム・仰角・注視点だけをこの値へなめらかに近づける。
// 上下方向のランダムな揺れも、この仰角（cameraHomeで指定した見上げ角）を中心に行う。
const HOME_ORBIT = (() => {
    const dx = HOME.px - HOME.tx;
    const dy = HOME.py - HOME.ty;
    const dz = HOME.pz - HOME.tz;
    const r  = Math.sqrt(dx * dx + dy * dy + dz * dz) || 15;
    return { r, phi: Math.acos(Math.max(-1, Math.min(1, dy / r))) };
})();

const AUTO_ORBIT = CONFIG.autoOrbit;
const ORBIT_PHI_CENTER             = HOME_ORBIT.phi;                             // 仰角の基準値（cameraHomeの見上げ角）
const ORBIT_PHI_RANGE              = (AUTO_ORBIT.verticalRangeDeg / 2) * DEG2RAD; // 仰角の可動範囲（基準値からの片側の振れ幅）
const ORBIT_THETA_SPEED_MIN        = AUTO_ORBIT.speedMinDeg * DEG2RAD;           // 水平回転速度の最小値（rad/秒）。反復運動に見えないよう常にある程度の速さを保つ
const ORBIT_THETA_SPEED_MAX        = AUTO_ORBIT.speedMaxDeg * DEG2RAD;           // 水平回転速度の最大値（rad/秒）
const ORBIT_PHI_SPEED_MAX          = AUTO_ORBIT.verticalSpeedMaxDeg * DEG2RAD;   // 仰角変化速度の最大値（rad/秒）
const ORBIT_SPEED_EASE_SEC         = 1.5;  // 目標速度へなめらかに近づくまでの目安秒数
const ORBIT_THETA_RETARGET_MIN_SEC = 20;   // 水平回転の向き・速さを選び直すまでの最小秒数（長めにして大きく周回させる）
const ORBIT_THETA_RETARGET_MAX_SEC = 40;   // 同・最大秒数
const ORBIT_PHI_RETARGET_MIN_SEC   = 3;    // 仰角の速さを選び直すまでの最小秒数
const ORBIT_PHI_RETARGET_MAX_SEC   = 7;    // 同・最大秒数
const ORBIT_RETURN_EASE_SEC        = 6;    // 無操作が続いた後、ズーム・仰角・注視点をホームへ戻す際の滑らかさの目安秒数
const ORBIT_PHI_ABS_MIN            = 0.15;          // 仰角の絶対下限（rad）。真上付近での見た目の破綻を防ぐ
const ORBIT_PHI_ABS_MAX            = Math.PI - 0.15; // 仰角の絶対上限（rad）。真下付近での見た目の破綻を防ぐ
                                                       // verticalRangeDeg をどれだけ大きくしても、この範囲内に収まる

// 水平回転の目標速度（向き・速さ）をランダムに選び直す。0付近を避けて完全停止しないようにする
function randomizeThetaTarget() {
    const thetaSign = Math.random() < 0.5 ? -1 : 1;
    orbitThetaSpeedGoal = thetaSign * (ORBIT_THETA_SPEED_MIN + Math.random() * (ORBIT_THETA_SPEED_MAX - ORBIT_THETA_SPEED_MIN));
}

// 仰角の目標速度をランダムに選び直す
function randomizePhiTarget() {
    orbitPhiSpeedGoal = (Math.random() * 2 - 1) * ORBIT_PHI_SPEED_MAX;
}

// ---- 端末の向き連動用の状態 ----
// 「注視点を中心にカメラが周回する」オービット方式ではなく、カメラの位置はその場から動かさず、
// 視線の向き（＝注視点の位置）だけを端末の傾きに応じて変える一人称視点の首振りとして扱う。
let gyroActive       = false;
let gyroBase         = null;          // 有効化した瞬間の端末の向き（基準値）
let lastOrientation  = null;          // 直近の deviceorientation イベント値
let gyroTheta        = 0;             // 有効化した瞬間の視線方向の水平角
let gyroPhi          = Math.PI / 2;   // 有効化した瞬間の視線方向の仰角
let gyroLookDistance = 15;            // 注視点をカメラの前方どれだけ先に置くか（見た目には影響しない）

function getOC() {
    return rig.components && rig.components['orbit-controls'];
}

function getCamObj(oc) {
    return oc.controls.object || oc.el.getObject3D('camera');
}

function lerpVec(vec, tx, ty, tz, f) {
    vec.x += (tx - vec.x) * f;
    vec.y += (ty - vec.y) * f;
    vec.z += (tz - vec.z) * f;
}

function distSq(vec, tx, ty, tz) {
    const dx = vec.x - tx, dy = vec.y - ty, dz = vec.z - tz;
    return dx*dx + dy*dy + dz*dz;
}

// ---- 端末の向きで視点を操作する機能 ----
function requestGyroPermission() {
    // iOS 13+ の Safari はユーザー操作から呼び出さないと許可ダイアログが出ない
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return DeviceOrientationEvent.requestPermission();
    }
    return Promise.resolve('granted');
}

// 角度の差分をラップアラウンド（0°/360°の境界）を考慮して計算
function angleDeltaDeg(a, b) {
    return ((a - b + 180) % 360 + 360) % 360 - 180;
}

function onDeviceOrientation(e) {
    if (e.alpha === null) return; // センサー値が取得できない端末
    if (!gyroBase) {
        gyroBase = { alpha: e.alpha, beta: e.beta || 0 };
    }
    lastOrientation = e;
}

function enableGyro() {
    const oc = getOC();
    if (!oc || !oc.controls) return;
    const camObj = getCamObj(oc);
    if (!camObj) return;
    const target = oc.controls.target;

    // 現在の視線方向（カメラ位置→注視点）を球面座標として取得し、そのまま起点にする
    const dx = target.x - camObj.position.x;
    const dy = target.y - camObj.position.y;
    const dz = target.z - camObj.position.z;
    gyroLookDistance = Math.sqrt(dx*dx + dy*dy + dz*dz) || 15;
    gyroTheta = Math.atan2(dx, dz);
    gyroPhi   = Math.acos(Math.max(-1, Math.min(1, dy / gyroLookDistance)));

    gyroBase        = null;
    lastOrientation = null;
    gyroActive      = true;
    // カメラの位置・向きは端末の向きだけで決めるので、orbit-controlsによるドラッグでの
    // カメラ操作は無効化する。1〜3本指操作はAR中と同じくモデル側の回転・拡縮・移動として
    // arTouch* が引き続き扱う（ARモードと統一した挙動）
    oc.controls.enabled = false;

    stopIdle();
    clearTimeout(idleTimer);

    window.addEventListener('deviceorientation', onDeviceOrientation);
    gyroBtn.classList.add('active');
}

function disableGyro() {
    if (!gyroActive) return;
    gyroActive = false;
    window.removeEventListener('deviceorientation', onDeviceOrientation);

    const oc = getOC();
    if (oc && oc.controls) {
        // ジャイロ中は注視点をカメラの遠く前方に置いていたため、そのまま orbit-controls を
        // 再開するとその遠い点を中心に周回してしまう。注視点をモデル中心（ホーム注視点）へ
        // 戻してから再開し、通常どおりモデルを中心に周回できるようにする。
        oc.controls.target.set(HOME.tx, HOME.ty, HOME.tz);
        oc.controls.enabled = true;
    }

    gyroBtn.classList.remove('active');
    if (!inXR) idleTimer = setTimeout(startIdle, ORBIT_DELAY * 1000);
}

// ---- 端末の向き rAF ループ ----
// deviceorientation イベントの値を毎フレーム反映する。カメラの位置（camObj.position）は
// 一切書き換えず、その場に固定したまま、視線の先＝注視点（target）だけを端末の傾きに応じて
// 動かす（＝その場での一人称視点の首振り）。位置を毎フレーム読み直しているので、ドラッグでの
// 回転やピンチズームでカメラの位置が変わっても、その新しい位置を起点に視線変更が続けられる。
//
// 注視点を置く距離は、有効化した瞬間の値（gyroLookDistance）に固定せず、直前フレームの
// 実際のカメラ〜注視点間の距離を毎回読み直して使う。固定してしまうと、ピンチズームで
// 距離が変わってもジャイロが毎フレーム元の距離に戻してしまい、ズームが効かなくなるため。
//
// orbit-controls は enableGyro で無効化してあるため、注視点(target)を書き換えるだけでは
// カメラの向きは変わらない（無効時は controls.update() が呼ばれないため）。そこで毎フレーム
// camObj.lookAt() を明示的に呼び、カメラをその注視点へ実際に向ける（＝一人称の首振り）。
//
// 上下方向（dBeta）の向き： 端末を上に傾ける（見上げる）→ phi が小さくなる方向（視線が上を向く）
//                          端末を下に傾ける（見下ろす）→ phi が大きくなる方向（視線が下を向く）
// 実機での向きが逆に感じる場合は、下の dBeta の符号（+ / -）を反転してください。
function gyroLoop() {
    if (gyroActive && !inXR && gyroBase && lastOrientation) {
        const oc = getOC();
        if (oc && oc.controls) {
            const camObj = getCamObj(oc);
            const target = oc.controls.target;
            if (camObj) {
                const ddx = target.x - camObj.position.x;
                const ddy = target.y - camObj.position.y;
                const ddz = target.z - camObj.position.z;
                const curDistance = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz) || gyroLookDistance;

                const dAlpha = angleDeltaDeg(lastOrientation.alpha, gyroBase.alpha) * Math.PI / 180;
                const dBeta  = ((lastOrientation.beta || 0) - gyroBase.beta) * Math.PI / 180;

                const theta = gyroTheta - dAlpha;
                let phi     = gyroPhi + dBeta;
                phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi)); // 真上・真下付近での反転を防止

                const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
                target.x = camObj.position.x + curDistance * sinPhi * Math.sin(theta);
                target.y = camObj.position.y + curDistance * cosPhi;
                target.z = camObj.position.z + curDistance * sinPhi * Math.cos(theta);

                camObj.lookAt(target.x, target.y, target.z);
            }
        }
    }
    requestAnimationFrame(gyroLoop);
}
requestAnimationFrame(gyroLoop);

// ---- AR/ジャイロモード中の操作（モデルの回転・拡大縮小・移動） ----
// AR・VRセッション中はXR機器の実際の位置・向きがそのままカメラに反映されるため、通常モードの
// ようにドラッグでカメラ自体を動かす操作は成立しない（書き換えてもXR機器のトラッキング位置に
// 毎フレーム上書きされてしまう）。ジャイロモードも同様に、カメラの向きは端末の向きだけで決まる。
// そのため、AR中およびジャイロ操作中の1本指ドラッグ／2本指ピンチ・ドラッグは、カメラではなく
// 「モデル側」を回転・拡大縮小・移動させることで、通常モードと同じ感覚の操作を実現する。
const ARTOUCH_ROTATE_DEG_PER_PX = 0.5;   // 1本指ドラッグ: 1pxあたりの回転角度（度）
const ARTOUCH_PAN_PER_PX        = 0.01;  // 2本指ドラッグ: 1pxあたりの移動量
const ARTOUCH_SCALE_MIN         = 0.1;   // モデル拡大縮小の下限（config指定スケールに対する倍率）
const ARTOUCH_SCALE_MAX         = 10;    // 同・上限

const baseModelScale = { x: ms.x, y: ms.y, z: ms.z }; // config.js で指定した基準スケール
let arTouchState = null;

function arTouchActive() {
    return scene.is('ar-mode') || gyroActive;
}

function touchMidpoint(t0, t1) {
    return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
}

function touchDistance(t0, t1) {
    return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
}

function onArTouchStart(e) {
    if (!arTouchActive()) return;
    if (e.touches.length === 1) {
        arTouchState = {
            mode: 'rotate',
            x: e.touches[0].clientX,
            rotY: modelEntity.object3D.rotation.y,
        };
    } else if (e.touches.length >= 2) {
        const mid = touchMidpoint(e.touches[0], e.touches[1]);
        arTouchState = {
            mode: 'pinch-pan',
            dist: touchDistance(e.touches[0], e.touches[1]) || 1,
            midX: mid.x,
            midY: mid.y,
            scale: baseModelScale.x ? modelEntity.object3D.scale.x / baseModelScale.x : 1,
            posX: modelEntity.object3D.position.x,
            posZ: modelEntity.object3D.position.z,
        };
    }
}

function onArTouchMove(e) {
    if (!arTouchActive() || !arTouchState) return;

    if (arTouchState.mode === 'rotate' && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - arTouchState.x;
        modelEntity.object3D.rotation.y = arTouchState.rotY + dx * ARTOUCH_ROTATE_DEG_PER_PX * DEG2RAD;
    } else if (arTouchState.mode === 'pinch-pan' && e.touches.length >= 2) {
        e.preventDefault();
        const dist = touchDistance(e.touches[0], e.touches[1]);
        const mid  = touchMidpoint(e.touches[0], e.touches[1]);

        const scale = Math.max(ARTOUCH_SCALE_MIN, Math.min(ARTOUCH_SCALE_MAX, arTouchState.scale * (dist / arTouchState.dist)));
        modelEntity.object3D.scale.set(baseModelScale.x * scale, baseModelScale.y * scale, baseModelScale.z * scale);

        modelEntity.object3D.position.x = arTouchState.posX + (mid.x - arTouchState.midX) * ARTOUCH_PAN_PER_PX;
        modelEntity.object3D.position.z = arTouchState.posZ + (mid.y - arTouchState.midY) * ARTOUCH_PAN_PER_PX;
    }
}

function onArTouchEnd(e) {
    if (!arTouchActive()) { arTouchState = null; return; }
    if (e.touches.length === 0) {
        arTouchState = null;
    } else if (e.touches.length === 1) {
        // 2本指から1本指に減った場合は回転操作として再スタートする
        arTouchState = {
            mode: 'rotate',
            x: e.touches[0].clientX,
            rotY: modelEntity.object3D.rotation.y,
        };
    }
}

document.addEventListener('touchstart',  onArTouchStart, { passive: true });
document.addEventListener('touchmove',   onArTouchMove,  { passive: false });
document.addEventListener('touchend',    onArTouchEnd,   { passive: true });
document.addEventListener('touchcancel', onArTouchEnd,   { passive: true });

// ---- 自動オービット rAF ループ ----
// autoRotate に依存せず、毎フレーム球面座標でカメラ位置を直接計算・設定する。
// OrbitControls は次の update() でこの位置を読み取り、そのまま維持する。
// 水平回転・仰角の速度を一定間隔でランダムに選び直し、そこへなめらかに近づけることで、
// 毎回異なる・その場でリアルタイムに揺らぐ軌道になる（決まりきった周期運動にはならない）。
function autoOrbitLoop(timestamp) {
    const t  = timestamp * 0.001; // 秒
    const dt = orbitLastTime === null ? 0 : Math.min(t - orbitLastTime, 0.1);
    orbitLastTime = isIdle && !gyroActive && !inXR ? t : null;

    if (isIdle && !gyroActive && !inXR) {
        const oc = getOC();
        if (oc && oc.controls) {
            const camObj = getCamObj(oc);
            if (camObj) {
                const target = oc.controls.target;

                // 初回: 現在位置から球面座標を取得し、目標速度も新たに抽選
                if (orbitTheta === null) {
                    const dx = camObj.position.x - target.x;
                    const dy = camObj.position.y - target.y;
                    const dz = camObj.position.z - target.z;
                    orbitR     = Math.sqrt(dx*dx + dy*dy + dz*dz) || 15;
                    orbitTheta = Math.atan2(dx, dz);
                    orbitPhi   = Math.acos(Math.max(-1, Math.min(1, dy / orbitR)));
                    randomizeThetaTarget();
                    randomizePhiTarget();
                    orbitThetaRetargetAt = t + ORBIT_THETA_RETARGET_MIN_SEC + Math.random() * (ORBIT_THETA_RETARGET_MAX_SEC - ORBIT_THETA_RETARGET_MIN_SEC);
                    orbitPhiRetargetAt   = t + ORBIT_PHI_RETARGET_MIN_SEC   + Math.random() * (ORBIT_PHI_RETARGET_MAX_SEC   - ORBIT_PHI_RETARGET_MIN_SEC);
                }

                // 水平回転は長い間隔でしか向き・速さを選び直さない（モデルの全周が見えるくらい大きく周回させる）
                if (t >= orbitThetaRetargetAt) {
                    randomizeThetaTarget();
                    orbitThetaRetargetAt = t + ORBIT_THETA_RETARGET_MIN_SEC + Math.random() * (ORBIT_THETA_RETARGET_MAX_SEC - ORBIT_THETA_RETARGET_MIN_SEC);
                }
                // 仰角は短い間隔でゆらぐ
                if (t >= orbitPhiRetargetAt) {
                    randomizePhiTarget();
                    orbitPhiRetargetAt = t + ORBIT_PHI_RETARGET_MIN_SEC + Math.random() * (ORBIT_PHI_RETARGET_MAX_SEC - ORBIT_PHI_RETARGET_MIN_SEC);
                }

                // 現在速度を目標速度へなめらかに近づける（急な方向転換を避ける）
                const ease = dt > 0 ? Math.min(1, dt / ORBIT_SPEED_EASE_SEC) : 0;
                orbitThetaSpeed += (orbitThetaSpeedGoal - orbitThetaSpeed) * ease;
                orbitPhiSpeed   += (orbitPhiSpeedGoal   - orbitPhiSpeed)   * ease;

                orbitTheta += orbitThetaSpeed * dt;

                if (idleReturnHome) {
                    // 無操作が長く続いた場合：水平回転（テーマ）はそのまま続けつつ、
                    // ズーム（半径）・仰角・注視点だけをホーム視点へなめらかに近づける。
                    // 一気に戻す（テレポート/直線移動）のではなく、自動回転を続けながら徐々に収束させる。
                    const returnEase = dt > 0 ? Math.min(1, dt / ORBIT_RETURN_EASE_SEC) : 0;
                    orbitR   += (HOME_ORBIT.r   - orbitR)   * returnEase;
                    orbitPhi += (HOME_ORBIT.phi - orbitPhi) * returnEase;
                    lerpVec(target, HOME.tx, HOME.ty, HOME.tz, returnEase);
                } else {
                    const phiMin = Math.max(ORBIT_PHI_ABS_MIN, ORBIT_PHI_CENTER - ORBIT_PHI_RANGE);
                    const phiMax = Math.min(ORBIT_PHI_ABS_MAX, ORBIT_PHI_CENTER + ORBIT_PHI_RANGE);
                    let nextPhi  = orbitPhi + orbitPhiSpeed * dt;
                    if (nextPhi < phiMin || nextPhi > phiMax) {
                        nextPhi = Math.max(phiMin, Math.min(phiMax, nextPhi));
                        orbitPhiSpeed     *= -1; // 可動範囲の端で自然に跳ね返す
                        orbitPhiSpeedGoal *= -1;
                    }
                    orbitPhi = nextPhi;
                }

                const sinPhi = Math.sin(orbitPhi);
                const cosPhi = Math.cos(orbitPhi);

                camObj.position.x = target.x + orbitR * sinPhi * Math.sin(orbitTheta);
                camObj.position.y = target.y + orbitR * cosPhi;
                camObj.position.z = target.z + orbitR * sinPhi * Math.cos(orbitTheta);
            }
        }
    }
    requestAnimationFrame(autoOrbitLoop);
}
requestAnimationFrame(autoOrbitLoop);

// ---- 待機状態の開始・終了 ----
function startIdle() {
    isIdle         = true;
    idleReturnHome = false;
    orbitTheta     = null; // 現在位置から再初期化してオービット開始

    if (!userHasInteracted) {
        exploreTimer = setTimeout(() => {
            if (isIdle) explorePrompt.classList.add('visible');
        }, 1500);
    }

    // RESET_DELAY 秒後：位置を直接リセットするのではなく、以降の autoOrbitLoop で
    // 自動回転を続けながらズーム・仰角・注視点をホーム視点へなめらかに戻す
    resetTimer = setTimeout(() => { idleReturnHome = true; }, RESET_DELAY * 1000);
}

function stopIdle() {
    isIdle         = false;
    isResetting    = false;
    idleReturnHome = false;
    orbitTheta     = null;
    orbitR         = null;
    orbitPhi       = null;
    // 速度も静止状態に戻す。次にアイドルが始まった際、前回の巡航速度をそのまま引き継いで
    // いきなり動き出すのではなく、必ず止まった状態からなめらかに加速し始めるようにするため。
    orbitThetaSpeed     = 0;
    orbitThetaSpeedGoal = 0;
    orbitPhiSpeed       = 0;
    orbitPhiSpeedGoal   = 0;
    clearTimeout(exploreTimer);
    clearTimeout(resetTimer);
    cancelAnimationFrame(resetAnim);
    explorePrompt.classList.remove('visible');
}

// ---- ユーザー操作ハンドラ ----
function onUserInteraction() {
    if (gyroActive) return; // ジャイロ操作中はアイドル用タイマーを動かさない
    userHasInteracted = true;
    stopIdle();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startIdle, ORBIT_DELAY * 1000);
}

['pointerdown', 'wheel', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, onUserInteraction, { passive: true })
);

// ページロード後 2 秒でアイドル開始
idleTimer = setTimeout(startIdle, 2000);

// ---- ホーム視点へなめらかに戻すアニメーション ----
// 視点リセットボタンと、AR/VRセッション終了時（exit-vr）の両方から使う。
// step が大きいほど速く戻る。毎フレーム rAF で少しずつホームへ近づける。
function animateToHome(step) {
    stopIdle();
    clearTimeout(idleTimer);
    isResetting = true;
    cancelAnimationFrame(resetAnim);

    function loop() {
        const oc = getOC();
        if (!oc || !oc.controls) {
            resetAnim = requestAnimationFrame(loop);
            return;
        }

        const camObj = getCamObj(oc);
        if (camObj) lerpVec(camObj.position, HOME.px, HOME.py, HOME.pz, step);
        lerpVec(oc.controls.target, HOME.tx, HOME.ty, HOME.tz, step);

        const dCam = camObj ? distSq(camObj.position, HOME.px, HOME.py, HOME.pz) : 0;
        const dTgt = distSq(oc.controls.target, HOME.tx, HOME.ty, HOME.tz);

        if (dCam > 0.01 || dTgt > 0.01) {
            resetAnim = requestAnimationFrame(loop);
        } else {
            isResetting = false;
            idleTimer   = setTimeout(startIdle, ORBIT_DELAY * 1000);
        }
    }
    resetAnim = requestAnimationFrame(loop);
}

// ---- 視点リセットボタン ----
const resetBtn = document.getElementById('reset-btn');

resetBtn.addEventListener('click', () => {
    resetBtn.classList.add('spinning');
    setTimeout(() => resetBtn.classList.remove('spinning'), 420);

    disableGyro();
    animateToHome(0.06);
});

// ---- フルスクリーン ----
const fsBtn        = document.getElementById('fullscreen-btn');
const iconExpand   = document.getElementById('icon-expand');
const iconCollapse = document.getElementById('icon-collapse');

function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFsIcon() {
    const fs = isFullscreen();
    iconExpand.style.display   = fs ? 'none' : '';
    iconCollapse.style.display = fs ? ''     : 'none';
    fsBtn.title = fs ? '全画面を終了' : '全画面表示';
}

fsBtn.addEventListener('click', () => {
    if (isFullscreen()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
});

document.addEventListener('fullscreenchange', updateFsIcon);
document.addEventListener('webkitfullscreenchange', updateFsIcon);


// MIT License | github.com/ChikumaTateshina/Web3DViewer