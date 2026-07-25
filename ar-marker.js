// ============================================================
// マーカー型AR（ar-marker.html）のスクリプト
// config.js の markerAR 設定に従い、マーカーの種類・表示モデル・
// モデルの配置を反映します。
// ============================================================
const CONFIG    = VIEWER_CONFIG;
const AR        = CONFIG.markerAR || {};
const marker    = document.getElementById('marker');
const arModel   = document.getElementById('ar-model');
const hint      = document.getElementById('ar-hint');
const hintText  = document.getElementById('ar-hint-text');

// ---- 「画像ARに切り替え」ボタンの表示可否（config の imageAR.enableButton） ----
const switchImageBtn = document.getElementById('switch-image-btn');
if (switchImageBtn && CONFIG.imageAR && CONFIG.imageAR.enableButton) {
    switchImageBtn.style.display = '';
}

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

// ---- マーカー検出状態に応じて案内の表示を切り替える ----
// マーカーが見つかっている間は「カメラを向けてください」の案内を隠す
marker.addEventListener('markerFound', () => hint.classList.add('hidden'));
marker.addEventListener('markerLost',  () => hint.classList.remove('hidden'));

// ---- カメラ利用の失敗時の案内 ----
// AR.js はページ読み込み時にカメラ（getUserMedia）を要求する。拒否/非対応の場合に案内を出す。
window.addEventListener('load', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        hintText.textContent = 'この端末／ブラウザはカメラに対応していません';
        hint.classList.remove('hidden');
        return;
    }
    // AR.js 内部でカメラ取得に失敗した場合、arjs-video-error イベントが飛ぶ
    document.addEventListener('camera-error', () => {
        hintText.textContent = 'カメラを開始できませんでした（権限を許可してください）';
        hint.classList.remove('hidden');
    });
});

// AR.js がカメラ取得に失敗したときのイベント（バージョンにより名称が異なるため両方拾う）
window.addEventListener('camera-init-error', () => {
    hintText.textContent = 'カメラを開始できませんでした（権限を許可し、https でアクセスしてください）';
    hint.classList.remove('hidden');
});


// MIT License | github.com/ChikumaTateshina/Web3DViewer
