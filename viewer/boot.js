// ============================================================
// 各モデルのページ（<モデル名>/index.html など）から読み込まれる起動スクリプト
//
// モデルごとのフォルダには数行の入口HTMLしか置かず、このファイルが
//   1. defaults.js（既定値）とモデルの config.json を読み込んで設定を作り
//   2. そのページに必要なライブラリとCSSを読み込み
//   3. pages/ 以下の断片HTMLを <body> に挿入し
//   4. ページ本体のスクリプト（main.js など）を実行する
// という順で画面を組み立てる。ビューア本体を全モデルで共有するための仕組み。
//
// 入口HTML側の指定:
//   <script src="../viewer/boot.js" data-page="viewer" data-root="./"></script>
//     data-page … 表示するページの種類（下の PAGES のキー）
//     data-root … そのページから見たモデルのフォルダ（config.json と Assets の場所）
// ============================================================
(function () {
    const script      = document.currentScript;
    const page        = script.dataset.page;
    const VIEWER_BASE = new URL('./', script.src).href;
    const MODEL_ROOT  = new URL(script.dataset.root || './', location.href).href;
    const PREVIEW     = new URLSearchParams(location.search).has('preview');

    const AFRAME_142 = 'https://aframe.io/releases/1.4.2/aframe.min.js';
    const AFRAME_160 = 'https://aframe.io/releases/1.6.0/aframe.min.js';
    const EXTRAS     = 'https://cdn.jsdelivr.net/npm/aframe-extras@7.5.4/dist/aframe-extras.min.js';
    const ARJS       = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.7/aframe/build/';

    // AR.js は A-Frame 1.6.0 が必要で、マーカー型と画像型は排他的な別ビルドのため、
    // ページの種類ごとに読み込むライブラリが異なる
    const PAGES = {
        'viewer': {
            libs: [AFRAME_142, 'https://unpkg.com/aframe-orbit-controls@1.3.2/dist/aframe-orbit-controls.min.js', EXTRAS],
            css: 'style.css', html: 'pages/viewer.html', js: 'main.js'
        },
        'ar-marker': {
            libs: [AFRAME_160, ARJS + 'aframe-ar.js', EXTRAS],
            css: 'ar.css', html: 'pages/ar-marker.html', js: 'ar-marker.js'
        },
        'ar-image': {
            libs: [AFRAME_160, ARJS + 'aframe-ar-nft.js', EXTRAS],
            css: 'ar.css', html: 'pages/ar-image.html', js: 'ar-image.js'
        },
        'admin': {
            libs: [],
            css: 'admin.css', html: 'pages/admin.html', js: 'admin.js'
        }
    };

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = () => reject(new Error(`読み込めませんでした: ${src}`));
            document.head.appendChild(el);
        });
    }

    // 既定値に上書き値を重ねる（オブジェクトは項目ごと、配列と値は丸ごと置き換え）
    function mergeConfig(base, override) {
        const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
        Object.keys(override || {}).forEach(key => {
            const b = base[key], o = override[key];
            const bothObjects = b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o);
            out[key] = bothObjects ? mergeConfig(b, o) : o;
        });
        return out;
    }

    async function loadConfig() {
        // 管理画面のプレビュー枠では、保存前の編集内容（管理画面が sessionStorage に置いた下書き）を使う
        if (PREVIEW) {
            try {
                const draft = sessionStorage.getItem('w3dv-draft:' + MODEL_ROOT);
                if (draft) return JSON.parse(draft);
            } catch (e) { /* 下書きが読めなければ通常どおり config.json を使う */ }
        }
        // 管理画面から保存した直後でも古い内容が出ないよう、キャッシュは毎回サーバーに確認する
        const res = await fetch(MODEL_ROOT + 'config.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`config.json を読み込めませんでした（${res.status}）`);
        return res.json();
    }

    async function boot() {
        const def = PAGES[page];
        if (!def) throw new Error(`data-page の指定が正しくありません: ${page}`);

        // 表示を固定中のタブでは、固定したページ以外（管理画面を含む）を開かせない
        await loadScript(VIEWER_BASE + 'lock.js');
        if (window.W3DV_LOCK.redirectIfElsewhere()) return;

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = VIEWER_BASE + def.css;
        document.head.appendChild(css);

        await loadScript(VIEWER_BASE + 'defaults.js');
        const [config, html] = await Promise.all([
            loadConfig(),
            fetch(VIEWER_BASE + def.html).then(r => r.text())
        ]);

        window.W3DV_ENV      = { MODEL_ROOT, VIEWER_BASE, PREVIEW, page, mergeConfig };
        window.VIEWER_CONFIG = mergeConfig(window.W3DV_DEFAULTS, config);

        // A-Frame 本体 → プラグインの順に読み込む必要があるため、1つずつ順番に読み込む
        for (const lib of def.libs) await loadScript(lib);

        document.body.insertAdjacentHTML('afterbegin', html);
        await loadScript(VIEWER_BASE + def.js);

        // 管理画面と、その中のプレビュー枠では、左上長押しによる固定／解除は使わない
        if (page !== 'admin' && !PREVIEW) window.W3DV_LOCK.init(window.VIEWER_CONFIG.enableDisplayLock);
    }

    boot().catch(err => {
        console.error(err);
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#12181f;color:#e8edf2;font:14px/1.7 sans-serif;text-align:center;z-index:9999';
        box.textContent = `ページを表示できませんでした。${err.message}`;
        document.body.appendChild(box);
    });
})();


// MIT License | github.com/ChikumaTateshina/Web3DViewer
