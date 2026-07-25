// ============================================================
// マーカー型AR（ar-marker.html）のスクリプト
// config.js の markerAR 設定に従い、マーカーの種類・表示モデル・
// モデルの配置を反映します。
// ============================================================
const CONFIG    = VIEWER_CONFIG;
const AR        = CONFIG.markerAR || {};
const ARUI      = CONFIG.arUI || {};
const marker    = document.getElementById('marker');
const arModel   = document.getElementById('ar-model');
const hint      = document.getElementById('ar-hint');
const hintText  = document.getElementById('ar-hint-text');

// ---- 画面上のUIの表示・非表示（config の arUI で切り替え） ----
// 戻るボタン（既定で表示。showBackButton が false のときだけ隠す）
const backBtn = document.getElementById('back-btn');
if (backBtn && ARUI.showBackButton === false) backBtn.style.display = 'none';

// モード切り替え（画像ARへ）ボタン（HTML側で既定 display:none。表示指定のときだけ出す）
const switchImageBtn = document.getElementById('switch-image-btn');
if (switchImageBtn && ARUI.showModeSwitchButton !== false) switchImageBtn.style.display = '';

// ---- マーカーの種類を設定 ----
// "hiro"（標準）/ "barcode"（番号）/ "pattern"（自作 .patt）
if (AR.markerType === 'pattern' && AR.patternFile) {
    marker.setAttribute('type', 'pattern');
    marker.setAttribute('url', `Assets/${AR.patternFile}`);
    marker.removeAttribute('preset');
} else if (AR.markerType === 'barcode') {
    marker.setAttribute('type', 'barcode');
    marker.setAttribute('value', AR.barcodeValue || 0);
    marker.removeAttribute('preset');
} else {
    // 既定：AR.js標準のHiroマーカー
    marker.setAttribute('preset', 'hiro');
}

// ---- 表示するモデルと、マーカー上での配置 ----
arModel.setAttribute('gltf-model', `Assets/${CONFIG.modelFile}`);

const p = AR.modelPosition || { x: 0, y: 0, z: 0 };
const r = AR.modelRotation || { x: 0, y: 0, z: 0 };
const s = AR.modelScale    || { x: 1, y: 1, z: 1 };
arModel.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
arModel.setAttribute('rotation', `${r.x} ${r.y} ${r.z}`);
arModel.setAttribute('scale', `${s.x} ${s.y} ${s.z}`);

// ---- glTFアニメーションの再生（通常ビューアと同じ設定を流用） ----
if (CONFIG.playAnimations) {
    arModel.setAttribute('animation-mixer', `clip: ${CONFIG.animationClip || '*'}; loop: ${CONFIG.animationLoop}; timeScale: ${CONFIG.animationTimeScale}`);
}

// ---- 裏面の描画設定 ----
if (CONFIG.cullBackfaces) {
    arModel.addEventListener('model-loaded', () => {
        const mesh = arModel.getObject3D('mesh');
        if (!mesh) return;
        mesh.traverse(node => {
            if (!node.isMesh || !node.material) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(mat => { mat.side = THREE.FrontSide; });
        });
    });
}

// ---- 案内テキストの表示制御（config の arUI.showHint） ----
const showHint = ARUI.showHint !== false;
function setHint(text) {
    // showHint が false のときはエラー含め一切表示しない
    if (!showHint) return;
    if (text) hintText.textContent = text;
    hint.classList.remove('hidden');
}
if (!showHint) {
    hint.classList.add('hidden');
} else {
    // マーカーが見つかっている間は「カメラを向けてください」の案内を隠す
    marker.addEventListener('markerFound', () => hint.classList.add('hidden'));
    marker.addEventListener('markerLost',  () => hint.classList.remove('hidden'));
}

// ---- カメラ利用の失敗時の案内 ----
// AR.js はページ読み込み時にカメラ（getUserMedia）を要求する。拒否/非対応の場合に案内を出す。
window.addEventListener('load', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHint('この端末／ブラウザはカメラに対応していません');
        return;
    }
    document.addEventListener('camera-error', () => {
        setHint('カメラを開始できませんでした（権限を許可してください）');
    });
});

// AR.js がカメラ取得に失敗したときのイベント（バージョンにより名称が異なるため両方拾う）
window.addEventListener('camera-init-error', () => {
    setHint('カメラを開始できませんでした（権限を許可し、https でアクセスしてください）');
});


// MIT License | github.com/ChikumaTateshina/Web3DViewer
