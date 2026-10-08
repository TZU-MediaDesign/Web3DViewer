// ============================================================
// 表示の固定（展示中に、来場者が別の画面へ移動してしまうのを防ぐ簡易ロック）
//
// 固定すると、そのタブでは
//   ・「戻る」やモード切り替えなど、別の画面へ移るボタンが消える
//   ・ブラウザの「戻る」でページを離れられなくなる
//   ・同じサイトの別のページ（管理画面を含む）を開いても、固定したページへ戻される
//
// 固定／解除は、画面の左上の角を3秒間長押しして、パスワードを入力して行う。
//
// あくまで簡易的な仕組み：パスワード（のハッシュ）はそのタブの sessionStorage にだけ置き、
// どこにも送信しない。タブやブラウザを閉じると解除される。アドレスバーから別サイトへ
// 移動することまでは防げない（端末側のアクセスガイド／画面固定と併用する想定）。
// ============================================================
(function () {
    const KEY          = 'w3dv-lock';
    const HOLD_MS      = 3000;   // 左上の角を長押しする時間
    const HOTSPOT_SIZE = 64;     // 長押しを受け付ける範囲（px）

    function read() {
        try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; }
    }

    async function hash(password) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const samePath = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

    // 固定中に、固定したページ以外を開いていたら固定したページへ戻す。戻した場合は true
    function redirectIfElsewhere() {
        const lock = read();
        if (!lock || samePath(new URL(lock.url).pathname, location.pathname)) return false;
        location.replace(lock.url);
        return true;
    }

    // url のページに表示を固定する（url 省略時は今のページ）
    async function lock(password, url) {
        sessionStorage.setItem(KEY, JSON.stringify({
            hash: await hash(password),
            url: url || location.origin + location.pathname
        }));
    }

    // ---- 固定中の制限 ----
    let trapInstalled = false;
    function apply() {
        const locked = !!read();
        document.documentElement.classList.toggle('w3dv-locked', locked);

        // ブラウザの「戻る」を押されても同じページに留まるよう、履歴に同じページを積み直す
        if (locked && !trapInstalled) {
            trapInstalled = true;
            history.pushState(null, '', location.href);
            window.addEventListener('popstate', () => {
                if (read()) history.pushState(null, '', location.href);
            });
        }
    }

    async function onHold() {
        const current = read();
        if (current) {
            const input = prompt('表示の固定を解除します。パスワードを入力してください。');
            if (input === null) return;
            if (await hash(input) !== current.hash) { alert('パスワードが違います。'); return; }
            sessionStorage.removeItem(KEY);
            location.reload(); // 隠していたボタン類を元に戻す
        } else {
            const input = prompt('この画面に表示を固定します。解除用のパスワードを決めて入力してください。\n（このブラウザを閉じると固定は解除されます）');
            if (!input) return;
            await lock(input);
            apply();
        }
    }

    // ---- 左上の角の長押し ----
    function installHotspot() {
        const spot = document.createElement('div');
        spot.style.cssText = `position:fixed;top:0;left:0;width:${HOTSPOT_SIZE}px;height:${HOTSPOT_SIZE}px;z-index:1000;touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none`;
        let timer = null;
        const cancel = () => clearTimeout(timer);
        spot.addEventListener('pointerdown', () => { cancel(); timer = setTimeout(onHold, HOLD_MS); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => spot.addEventListener(ev, cancel));
        spot.addEventListener('contextmenu', e => e.preventDefault());
        document.body.appendChild(spot);
    }

    // ビューア／AR の各ページで、画面を組み立てた後に呼ぶ。
    // allowToggle が false（設定で無効）でも、すでに固定中なら解除できるよう長押しは受け付ける
    function init(allowToggle) {
        const style = document.createElement('style');
        style.textContent = '.w3dv-locked #back-btn, .w3dv-locked #switch-image-btn, .w3dv-locked #switch-marker-btn, .w3dv-locked #marker-ar-btn { display: none !important; }';
        document.head.appendChild(style);
        apply();
        if (allowToggle || read()) installHotspot();
    }

    window.W3DV_LOCK = { init, lock, redirectIfElsewhere };
})();


// MIT License | github.com/ChikumaTateshina/Web3DViewer
