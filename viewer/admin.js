// ============================================================
// 管理画面（<モデル名>/admin）のスクリプト
//
// このモデルの設定（config.json）をフォームで編集し、右側のプレビュー枠
// （同じモデルのビューアを iframe で開いたもの）に反映する。
// 「GitHubに保存」で、編集内容を config.json としてリポジトリに直接コミットする。
//
// GitHub Pages は静的ホスティングのため、保存は GitHub の API を
// ブラウザから直接呼び出して行う（アクセストークンが必要）。
// ============================================================
const ENV       = window.W3DV_ENV;
const ROOT      = ENV.MODEL_ROOT;
const DRAFT_KEY = 'w3dv-draft:' + ROOT;   // boot.js がプレビュー時に読む下書きの保存場所

const clone = obj => JSON.parse(JSON.stringify(obj));

let savedConfig = clone(window.VIEWER_CONFIG); // 最後に読み込んだ／保存した内容
let config      = clone(savedConfig);          // 編集中の内容

const formEl   = document.getElementById('form');
const statusEl = document.getElementById('status');
const frame    = document.getElementById('preview');

// ---- フォームの定義 ----
// key は設定項目の名前（入れ子は "autoOrbit.speedMinDeg" のようにドットでつなぐ）。
// live: true の項目はプレビューを再読み込みせずその場で反映し、それ以外は再読み込みして反映する。
const VEC3 = ['x', 'y', 'z'];
const SECTIONS = [
    { title: 'タイトル', open: true, fields: [
        { key: 'pageTitle',    label: 'ページタイトル（ブラウザのタブ）', type: 'text', live: true },
        { key: 'displayTitle', label: '画面左上のタイトル（改行で複数行）', type: 'lines', live: true },
        { key: 'loadingText',  label: '読み込み中の文言（空で非表示）', type: 'text' }
    ] },
    { title: '初期視野', open: true, fields: [
        { type: 'camera-buttons' },
        { key: 'cameraHome', label: 'カメラの位置', type: 'nums', parts: ['px', 'py', 'pz'], names: VEC3, live: true },
        { key: 'cameraHome', label: '注視点', type: 'nums', parts: ['tx', 'ty', 'tz'], names: VEC3, live: true }
    ] },
    { title: '背景・霧', open: true, fields: [
        { key: 'backgroundType',  label: '背景の種類', type: 'select', options: [['color', '単色'], ['image', '360°パノラマ画像']] },
        { key: 'backgroundColor', label: '背景色', type: 'color', live: true },
        { key: 'backgroundImage', label: 'パノラマ画像のファイル名（Assets内）', type: 'text' },
        { key: 'fogColor', label: '霧の色', type: 'color', live: true },
        { key: 'fogNear',  label: '霧が始まる距離', type: 'number', live: true },
        { key: 'fogFar',   label: '霧で見えなくなる距離', type: 'number', live: true }
    ] },
    { title: 'モデル', fields: [
        { key: 'modelFile',     label: 'モデルのファイル名（Assets内）', type: 'text' },
        { key: 'modelPosition', label: '位置', type: 'nums', parts: VEC3, live: true },
        { key: 'modelRotation', label: '回転（度）', type: 'nums', parts: VEC3, live: true },
        { key: 'modelScale',    label: '拡大縮小', type: 'nums', parts: VEC3, live: true },
        { key: 'cullBackfaces', label: '裏面を描画しない', type: 'bool' }
    ] },
    { title: 'アニメーション', fields: [
        { key: 'playAnimations',     label: 'アニメーションを再生する', type: 'bool' },
        { key: 'animationClip',      label: 'クリップ名（* で全て）', type: 'text' },
        { key: 'animationLoop',      label: 'ループ方法', type: 'select', options: [['repeat', '繰り返し'], ['once', '1回のみ'], ['pingpong', '往復']] },
        { key: 'animationTimeScale', label: '再生速度の倍率', type: 'number' }
    ] },
    { title: '自動回転（無操作時）', note: 'プレビューでは視点を調整しやすいよう、自動回転は止めています。動きは公開ページで確認してください。', fields: [
        { key: 'idleOrbitDelaySec', label: '自動回転を始めるまでの秒数', type: 'number' },
        { key: 'idleResetDelaySec', label: '初期視野へ戻り始めるまでの秒数', type: 'number' },
        { key: 'autoOrbit.speedMinDeg',         label: '水平回転の最小速度（度/秒）', type: 'number' },
        { key: 'autoOrbit.speedMaxDeg',         label: '水平回転の最大速度（度/秒）', type: 'number' },
        { key: 'autoOrbit.verticalRangeDeg',    label: '上下の揺れ幅（度）', type: 'number' },
        { key: 'autoOrbit.verticalSpeedMaxDeg', label: '上下の揺れの最大速度（度/秒）', type: 'number' }
    ] },
    { title: '表示するボタン', fields: [
        { key: 'enableDeviceOrientation', label: 'ジャイロ操作（モバイルのみ）', type: 'bool' },
        { key: 'markerAR.enableButton',   label: 'マーカーAR（モバイルのみ）', type: 'bool' },
        { key: 'enableWebAR',             label: 'WebXR AR（対応端末のみ）', type: 'bool' },
        { key: 'enableWebVR',             label: 'WebXR VR（対応端末のみ）', type: 'bool' },
        { key: 'xrCameraPosition',        label: 'WebXR AR/VR の開始位置', type: 'nums', parts: VEC3 }
    ] },
    { title: '表示の固定', note: '展示中に来場者が別の画面へ移動しないよう、表示中のページに固定する簡易ロックです。ビューアやAR画面の左上の角を3秒間長押しし、パスワードを決めると固定、同じ操作とパスワードで解除します。パスワードはそのブラウザ内だけに保持され、ブラウザを閉じると解除されます。', fields: [
        { key: 'enableDisplayLock', label: '左上の長押しによる固定を使えるようにする', type: 'bool' },
        { type: 'lock-button' }
    ] },
    { title: 'マーカーAR', fields: [
        { key: 'markerAR.markerType',    label: 'マーカーの種類', type: 'select', options: [['hiro', 'Hiro（標準）'], ['barcode', 'バーコード'], ['pattern', '自作（.patt）']] },
        { key: 'markerAR.patternFile',   label: '.patt のファイル名（Assets内）', type: 'text' },
        { key: 'markerAR.barcodeValue',  label: 'バーコード番号（0〜63）', type: 'number' },
        { key: 'markerAR.modelPosition', label: 'マーカー上の位置', type: 'nums', parts: VEC3 },
        { key: 'markerAR.modelRotation', label: 'マーカー上の回転（度）', type: 'nums', parts: VEC3 },
        { key: 'markerAR.modelScale',    label: 'マーカー上の拡大縮小', type: 'nums', parts: VEC3 }
    ] },
    { title: '画像AR', fields: [
        { key: 'imageAR.descriptorName', label: '記述子の名前（Assets内・拡張子なし）', type: 'text' },
        { key: 'imageAR.modelPosition',  label: '画像上の位置', type: 'nums', parts: VEC3 },
        { key: 'imageAR.modelRotation',  label: '画像上の回転（度）', type: 'nums', parts: VEC3 },
        { key: 'imageAR.modelScale',     label: '画像上の拡大縮小', type: 'nums', parts: VEC3 }
    ] },
    { title: 'AR画面のUI', fields: [
        { key: 'arUI.showBackButton',       label: '「戻る」ボタン', type: 'bool' },
        { key: 'arUI.showModeSwitchButton', label: 'モード切り替えボタン', type: 'bool' },
        { key: 'arUI.showHint',             label: '操作案内テキスト', type: 'bool' }
    ] }
];

function getValue(key) {
    return key.split('.').reduce((obj, k) => obj[k], config);
}

function setValue(key, value) {
    const keys = key.split('.');
    const last = keys.pop();
    keys.reduce((obj, k) => obj[k], config)[last] = value;
}

// ---- プレビューへの反映 ----
function previewApi() {
    try { return frame.contentWindow && frame.contentWindow.W3DV; } catch (e) { return null; }
}

function writeDraft() {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(config));
}

let reloadTimer = null;
function reloadPreview() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => frame.contentWindow.location.reload(), 400);
}

function onEdited(live) {
    writeDraft();
    setStatus('');
    const api = previewApi();
    if (live && api) api.applyLive(config);
    else reloadPreview();
}

function isDirty() {
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
}

// ---- フォームの組み立て ----
function el(tag, props, ...children) {
    const node = Object.assign(document.createElement(tag), props || {});
    node.append(...children);
    return node;
}

function numberInput(value, onInput) {
    const input = el('input', { type: 'number', step: 'any', value });
    input.addEventListener('input', () => {
        const n = parseFloat(input.value);
        if (!Number.isNaN(n)) onInput(n);
    });
    return input;
}

const RENDERERS = {
    text(f) {
        const input = el('input', { type: 'text', value: getValue(f.key) });
        input.addEventListener('input', () => { setValue(f.key, input.value); onEdited(f.live); });
        return el('label', { className: 'field' }, el('span', {}, f.label), input);
    },
    lines(f) {
        const area = el('textarea', { rows: 2, value: getValue(f.key).join('\n') });
        area.addEventListener('input', () => {
            setValue(f.key, area.value.split('\n').filter(line => line.trim() !== ''));
            onEdited(f.live);
        });
        return el('label', { className: 'field' }, el('span', {}, f.label), area);
    },
    number(f) {
        const input = numberInput(getValue(f.key), n => { setValue(f.key, n); onEdited(f.live); });
        return el('label', { className: 'field' }, el('span', {}, f.label), input);
    },
    bool(f) {
        const box = el('input', { type: 'checkbox', checked: !!getValue(f.key) });
        box.addEventListener('change', () => { setValue(f.key, box.checked); onEdited(f.live); });
        return el('label', { className: 'check' }, box, el('span', {}, f.label));
    },
    select(f) {
        const select = el('select', {}, ...f.options.map(([value, label]) => el('option', { value }, label)));
        select.value = getValue(f.key);
        select.addEventListener('change', () => { setValue(f.key, select.value); onEdited(f.live); });
        return el('label', { className: 'field' }, el('span', {}, f.label), select);
    },
    color(f) {
        const isHex = v => /^#[0-9a-f]{6}$/i.test(v);
        const picker = el('input', { type: 'color', value: isHex(getValue(f.key)) ? getValue(f.key) : '#000000' });
        const text   = el('input', { type: 'text', value: getValue(f.key) });
        picker.addEventListener('input', () => { text.value = picker.value; setValue(f.key, picker.value); onEdited(f.live); });
        text.addEventListener('input', () => {
            if (!isHex(text.value)) return;
            picker.value = text.value;
            setValue(f.key, text.value);
            onEdited(f.live);
        });
        return el('div', { className: 'field' }, el('span', {}, f.label), el('div', { className: 'color-row' }, picker, text));
    },
    // 1つのオブジェクトの中の数値を横に並べる（位置 x/y/z など）
    nums(f) {
        const names = f.names || f.parts;
        const row = el('div', { className: 'num-row' }, ...f.parts.map((part, i) =>
            el('label', {}, el('span', {}, names[i]),
                numberInput(getValue(f.key)[part], n => { getValue(f.key)[part] = n; onEdited(f.live); }))
        ));
        return el('div', {}, el('span', { className: 'group-label' }, f.label), row);
    },
    'lock-button'() {
        const open = el('button', { type: 'button' }, 'このモデルを固定表示で開く');
        open.addEventListener('click', async () => {
            const password = prompt('公開ページを固定表示で開きます。解除用のパスワードを決めて入力してください。\n（保存していない変更は反映されません）');
            if (!password) return;
            await window.W3DV_LOCK.lock(password, ROOT);
            location.href = ROOT;
        });
        return el('div', { className: 'btn-row' }, open);
    },
    'camera-buttons'() {
        const capture = el('button', { type: 'button' }, '現在の視点を初期視野にする');
        capture.addEventListener('click', () => {
            const api = previewApi();
            const cam = api && api.getCamera();
            if (!cam) { setStatus('プレビューの読み込みが終わってからお試しください。', 'error'); return; }
            config.cameraHome = cam;
            renderForm();
            onEdited(true);
        });
        const go = el('button', { type: 'button' }, '初期視野へ移動');
        go.addEventListener('click', () => { const api = previewApi(); if (api) api.goHome(); });
        return el('div', {},
            el('p', { className: 'note' }, 'プレビューをドラッグして見せたい角度に合わせ、「現在の視点を初期視野にする」を押してください。'),
            el('div', { className: 'btn-row' }, capture, go));
    }
};

function renderForm() {
    // 作り直しても、各セクションの開閉状態は保つ
    const openState = [...formEl.children].map(d => d.open);
    formEl.textContent = '';
    SECTIONS.forEach((section, i) => {
        const details = el('details', { open: openState.length ? openState[i] : !!section.open },
            el('summary', {}, section.title));
        if (section.note) details.appendChild(el('p', { className: 'note' }, section.note));
        section.fields.forEach(f => details.appendChild(RENDERERS[f.type](f)));
        formEl.appendChild(details);
    });
}

function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = kind || '';
}

// ---- 保存先（GitHub）の設定 ----
// GitHub Pages のURL（https://<ユーザー名>.github.io/<リポジトリ名>/<モデル名>/）から
// 保存先を推測して初期値にする。独自ドメインなどで推測できない場合は手入力する。
const SITE_ROOT   = new URL('../', ROOT);
const GITHUB_KEY  = 'w3dv-github:' + SITE_ROOT.href;
const destDetails = document.getElementById('dest');
const dest = {
    owner:    document.getElementById('gh-owner'),
    repo:     document.getElementById('gh-repo'),
    branch:   document.getElementById('gh-branch'),
    path:     document.getElementById('gh-path'),
    token:    document.getElementById('gh-token'),
    remember: document.getElementById('gh-remember')
};

function initDest() {
    const host    = location.hostname.match(/^(.+)\.github\.io$/);
    const owner   = host ? host[1] : '';
    const repoDir = SITE_ROOT.pathname.replace(/^\/|\/$/g, '');
    const modelId = decodeURIComponent(new URL(ROOT).pathname.replace(/\/$/, '').split('/').pop());

    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(GITHUB_KEY)) || {}; } catch (e) { /* 初回は未保存 */ }

    dest.owner.value      = stored.owner  || owner;
    dest.repo.value       = stored.repo   || (host ? (repoDir || `${owner}.github.io`) : '');
    dest.branch.value     = stored.branch || 'main';
    dest.path.value       = `${modelId}/config.json`;
    dest.token.value      = stored.token  || '';
    dest.remember.checked = !!stored.token;
}

function rememberDest() {
    localStorage.setItem(GITHUB_KEY, JSON.stringify({
        owner:  dest.owner.value.trim(),
        repo:   dest.repo.value.trim(),
        branch: dest.branch.value.trim(),
        token:  dest.remember.checked ? dest.token.value.trim() : ''
    }));
}

// ---- GitHubに保存 ----
function toBase64(text) {
    let binary = '';
    new TextEncoder().encode(text).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

function configJson() {
    return JSON.stringify(config, null, 2) + '\n';
}

async function saveToGitHub() {
    const owner  = dest.owner.value.trim();
    const repo   = dest.repo.value.trim();
    const branch = dest.branch.value.trim();
    const path   = dest.path.value.trim().replace(/^\/+/, '');
    const token  = dest.token.value.trim();

    if (!owner || !repo || !branch || !path || !token) {
        destDetails.open = true;
        setStatus(token ? '保存先（GitHub）の項目をすべて入力してください。' : '保存にはアクセストークンが必要です。「保存先（GitHub）」に入力してください。', 'error');
        return;
    }
    rememberDest();

    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    const explain = status =>
        status === 401 ? 'アクセストークンが正しくないか、期限が切れています。' :
        status === 403 ? 'このトークンには書き込み権限がありません（Contents: Read and write が必要です）。' :
        status === 404 ? 'リポジトリが見つからないか、このトークンではアクセスできません。保存先の内容を確認してください。' :
        status === 409 ? '保存中に他の変更と競合しました。もう一度お試しください。' :
        `GitHubからエラーが返されました（${status}）。`;

    const body = configJson(); // 保存中に編集が続いても、送った時点の内容を「保存済み」として記録する
    setStatus('保存しています…');
    try {
        // 既存ファイルを上書きするには、その時点のファイルの識別子（sha）を添える必要がある
        const current = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
        if (!current.ok && current.status !== 404) { setStatus(explain(current.status), 'error'); return; }
        const sha = current.ok ? (await current.json()).sha : undefined;

        const res = await fetch(api, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ message: `設定を更新: ${path}`, content: toBase64(body), branch, sha })
        });
        if (!res.ok) { setStatus(explain(res.status), 'error'); return; }

        savedConfig = JSON.parse(body);
        setStatus('保存しました。公開ページへの反映には1〜2分かかります。', 'ok');
    } catch (e) {
        setStatus('GitHubに接続できませんでした。通信状況を確認してください。', 'error');
    }
}

// ---- ボタン ----
const saveBtn = document.getElementById('save-btn');
saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    await saveToGitHub();
    saveBtn.disabled = false;
});

document.getElementById('download-btn').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([configJson()], { type: 'application/json' }));
    el('a', { href: url, download: 'config.json' }).click();
    URL.revokeObjectURL(url);
});

document.getElementById('revert-btn').addEventListener('click', () => {
    config = clone(savedConfig);
    renderForm();
    writeDraft();
    reloadPreview();
    setStatus('最後に保存した内容に戻しました。');
});

dest.remember.addEventListener('change', rememberDest);

window.addEventListener('beforeunload', e => {
    if (isDirty()) e.preventDefault();
});

// ---- 起動 ----
document.getElementById('model-path').textContent = decodeURIComponent(new URL(ROOT).pathname);
document.getElementById('open-link').href = ROOT;
initDest();
renderForm();
writeDraft();
frame.src = ROOT + '?preview';


// MIT License | github.com/ChikumaTateshina/Web3DViewer
