// ============================================================
// 画像トラッキング型AR（ar-image.html / NFT）のスクリプト
// config.js の imageAR 設定に従い、記述子（NFTマーカー）・表示モデル・
// モデルの配置を反映します。
//
// 記述子（imageAR.descriptorName）が未設定の場合は、AR/カメラを起動せず、
// セットアップ手順の案内だけを表示します。
// ============================================================
const CONFIG   = VIEWER_CONFIG;
const IMG      = CONFIG.imageAR || {};
const arRoot   = document.getElementById('ar-root');
const hint     = document.getElementById('ar-hint');
const setup    = document.getElementById('ar-setup');

// ---- モード切り替えボタンの表示可否 ----
// （このページ自体は画像ARなので、マーカーARへ戻す導線のみ enableButton で制御）
const switchMarkerBtn = document.getElementById('switch-marker-btn');
if (switchMarkerBtn && CONFIG.markerAR && CONFIG.markerAR.enableButton === false) {
    switchMarkerBtn.style.display = 'none';
}

// ---- 記述子が未設定なら、案内だけ表示して終了 ----
if (!IMG.descriptorName) {
    hint.classList.add('hidden');
    setup.classList.remove('hidden');
} else {
    buildImageAR(IMG.descriptorName);
}

function buildImageAR(descriptorName) {
    const p = IMG.modelPosition || { x: 0, y: 0, z: 0 };
    const r = IMG.modelRotation || { x: 0, y: 0, z: 0 };
    const s = IMG.modelScale    || { x: 1, y: 1, z: 1 };

    // ---- アニメーション設定（通常ビューアと同じ値を流用） ----
    const animAttr = CONFIG.playAnimations
        ? ` animation-mixer="clip: ${CONFIG.animationClip || '*'}; loop: ${CONFIG.animationLoop}; timeScale: ${CONFIG.animationTimeScale}"`
        : '';

    // ---- a-scene（NFT）を組み立てて挿入 ----
    // trackingMethod: best … 端末性能に応じて最良の追跡方式を選ぶ
    arRoot.innerHTML = `
        <a-scene
            id="scene"
            vr-mode-ui="enabled: false"
            renderer="colorManagement: true; antialias: true"
            embedded
            arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: false;">

            <a-nft
                id="nft"
                type="nft"
                url="Assets/${descriptorName}"
                smooth="true"
                smoothCount="10"
                smoothTolerance="0.01"
                smoothThreshold="5">
                <a-entity
                    id="ar-model"
                    gltf-model="Assets/${CONFIG.modelFile}"
                    position="${p.x} ${p.y} ${p.z}"
                    rotation="${r.x} ${r.y} ${r.z}"
                    scale="${s.x} ${s.y} ${s.z}"${animAttr}></a-entity>
            </a-nft>

            <a-entity camera></a-entity>
        </a-scene>`;

    const nft = document.getElementById('nft');
    const arModel = document.getElementById('ar-model');

    // ---- 裏面の描画設定 ----
    if (CONFIG.cullBackfaces && arModel) {
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

    // ---- 画像検出状態に応じて案内の表示を切り替える ----
    if (nft) {
        nft.addEventListener('markerFound', () => hint.classList.add('hidden'));
        nft.addEventListener('markerLost',  () => hint.classList.remove('hidden'));
    }
}

// ---- カメラ利用の失敗時の案内 ----
window.addEventListener('camera-init-error', () => {
    document.getElementById('ar-hint-text').textContent = 'カメラを開始できませんでした（権限を許可し、https でアクセスしてください）';
    hint.classList.remove('hidden');
});


// MIT License | github.com/ChikumaTateshina/Web3DViewer
