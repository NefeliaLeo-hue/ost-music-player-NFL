console.log("[OST TEST] index.js loaded");

if (typeof jQuery === "undefined") {
    console.error("[OST Player] jQuery missing!");
} else {
    console.log("[OST Player] jQuery OK");
}

// =====================
// 本地文件数据库 (IndexedDB)
// =====================
const OST_DB = {
    db: null,
    init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("ArchiveOST_DB", 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("local_tracks")) {
                    db.createObjectStore("local_tracks", { keyPath: "id" });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },
    save(id, file) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("local_tracks", "readwrite");
            tx.objectStore("local_tracks").put({ id, file });
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    },
    get(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("local_tracks", "readonly");
            const req = tx.objectStore("local_tracks").get(id);
            req.onsuccess = () => resolve(req.result ? req.result.file : null);
            req.onerror = reject;
        });
    },
    delete(id) {
        return new Promise((resolve) => {
            const tx = this.db.transaction("local_tracks", "readwrite");
            tx.objectStore("local_tracks").delete(id);
            tx.oncomplete = resolve;
        });
    },
    getAllKeys() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("local_tracks", "readonly");
            const req = tx.objectStore("local_tracks").getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
    }
};

jQuery(async function () {
    console.log("[OST Player] INIT START");
    if ($("#ost-player-container").length) {
        console.log("[OST Player] Already loaded");
        return;
    }
    
    // 初始化数据库
    try {
        await OST_DB.init();
        console.log("[OST Player] DB Ready");
    } catch (err) {
        console.error("[OST Player] Database init failed:", err);
    }
    console.log("[OST Player] Initialized");

    // =====================
    // 数据读取与双列表初始化
    // =====================
    let playlistDirect = [];
    let savedDirect = localStorage.getItem("ost_custom_playlist");
    if (savedDirect) {
        try {
            playlistDirect = JSON.parse(savedDirect);
        } catch(e) {
            playlistDirect = savedDirect.split("\n").filter(l => l.trim() !== "").map(url => ({ type: 'url', name: url, url: url }));
        }
    }
    
    let playlistSearch = [];
    let savedSearch = localStorage.getItem("ost_playlist_search");
    if (savedSearch) {
        try { playlistSearch = JSON.parse(savedSearch); } catch(e) { console.error("解析搜索歌单失败", e); }
    }

    let activeMode = localStorage.getItem("ost_active_mode") || "direct";
    let currentPlaybackList = activeMode === "direct" ? playlistDirect : playlistSearch;
    let currentIndex = Number(localStorage.getItem("ost_current_index")) || 0;
    if (currentIndex >= currentPlaybackList.length) currentIndex = 0;
    
    let loopMode = localStorage.getItem("ost_loop_mode") || "list"; 
    let audio = new Audio();
    audio.volume = Number(localStorage.getItem("ost_volume")) || 0.5;
    let wasPlaying = localStorage.getItem("ost_playing") === "true";
    let currentBlobUrl = null; 

    // =====================
    // 注入 HTML (支持拖拽头部)
    // =====================
    const playerHTML = `
    <div id="ost-player-container">
        <div class="ost-cover">🎵</div>
        <div class="ost-info">
            <span class="ost-title">ARCHIVE_OST</span>
            <span class="ost-subtitle" id="ost-track-num">Track -- / --</span>
        </div>
        <div class="ost-controls">
            <button class="ost-btn" id="ost-play-btn">▶️</button>
            <button class="ost-btn" id="ost-next-btn">⏭️</button>
            <button class="ost-btn" id="ost-loop-btn">${loopMode === 'single' ? '🔂' : '🔁'}</button>
            <button class="ost-btn" id="ost-settings-btn">⚙️</button>
            <button class="ost-btn" id="ost-min-btn">🔽</button>
        </div>
    </div>

    <div id="ost-floating-settings" style="display:none; position:fixed; top:60px; right:20px; width:280px; background:rgba(24,24,27,0.95); border:1px solid #3f3f46; border-radius:12px; padding:15px; box-shadow:0 8px 16px rgba(0,0,0,0.8); z-index:999999; backdrop-filter:blur(8px); font-family:system-ui, sans-serif; box-sizing:border-box;">
        
        <!-- 设置面板顶部拖拽区 -->
        <div id="ost-settings-header" style="font-size:13px; color:#e4e4e7; font-weight:bold; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; cursor:grab; touch-action:none; padding-bottom:5px;">
            <span>🎵 播放列表设置 <span style="font-size:10px; color:#a1a1aa; font-weight:normal;">(按住拖拽)</span></span>
            <div>
                <span id="ost-help-btn" style="cursor:pointer; color:#60a5fa; padding:2px 6px; font-size:14px; margin-right:4px;" title="使用指南">❓</span>
                <span id="ost-close-btn" style="cursor:pointer; color:#a1a1aa; padding:2px 6px; font-size:14px;" title="关闭 (不保存修改)">✖</span>
            </div>
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid #3f3f46; padding-bottom: 10px;">
            <div id="ost-mode-direct" style="flex: 1; text-align: center; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🔗 自定义歌单</div>
            <div id="ost-mode-search" style="flex: 1; text-align: center; opacity: 0.5; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🌐 在线搜索</div>
        </div>

        <div style="display: flex; gap: 6px; margin-bottom: 12px;">
            <button class="ost-sort-btn" data-sort="az" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">A-Z</button>
            <button class="ost-sort-btn" data-sort="za" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">Z-A</button>
            <button class="ost-sort-btn" data-sort="reverse" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">反转</button>
            <button class="ost-sort-btn" data-sort="random" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">打乱</button>
        </div>

        <!-- ================= 自定义模式 UI ================= -->
        <div id="ost-direct-ui">
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                <input type="text" id="ost-new-link" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="粘贴直链网址...">
                <button id="ost-add-url-btn" style="background:#4f46e5; border:none; color:white; padding:0 8px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">➕ 直链</button>
                <button id="ost-add-local-btn" style="background:#10b981; border:none; color:white; padding:0 8px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">📁 本地</button>
                <input type="file" id="ost-local-upload" multiple accept="audio/*" style="display:none;">
            </div>
            <div style="font-size:10px; color:#a1a1aa; margin-bottom:6px;">我的自定义列表：</div>
            <ul id="ost-playlist-direct-container" style="list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; overflow-x: hidden; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;"></ul>
        </div>

        <!-- ================= 在线搜索模式 UI ================= -->
        <div id="ost-search-ui" style="display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="ost-search-input" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="输入歌名或歌手...">
                <button id="ost-do-search-btn" style="background:#4f46e5; border:none; color:white; padding:0 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">🔍 搜 索</button>
            </div>
            <ul id="ost-search-results" style="list-style: none; padding: 0; margin: 0; max-height: 100px; overflow-y: auto; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;"></ul>
            <div style="font-size:10px; color:#a1a1aa; margin:10px 0 6px;">我的搜索歌单：</div>
            <ul id="ost-playlist-search-container" style="list-style: none; padding: 0; margin: 0; max-height: 120px; overflow-y: auto; overflow-x: hidden; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;"></ul>
        </div>
        
        <button id="ost-save-btn" style="margin-top:15px; width:100%; background:linear-gradient(135deg, #a855f7, #6366f1); border:none; color:white; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">💾 保存并应用当前列表</button>
    </div>

    <!-- ================= 独立的使用指南弹窗 ================= -->
    <div id="ost-help-modal" style="display:none; position:fixed; top:10vh; left:50%; transform:translate(-50%, 0); width:320px; max-height:85vh; overflow-y:auto; background:rgba(24,24,27,0.98); border:1px solid #3f3f46; border-radius:12px; padding:20px; box-shadow:0 12px 32px rgba(0,0,0,0.9); z-index:9999999; backdrop-filter:blur(12px); font-family:system-ui, sans-serif; box-sizing:border-box; color:#d4d4d8; font-size:12px; line-height:1.6;">
        
        <!-- 指南弹窗顶部拖拽区 -->
        <div id="ost-help-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #3f3f46; padding-bottom:10px; cursor:grab; touch-action:none;">
            <span style="font-size:14px; font-weight:bold; color:#e4e4e7;">📖 播放器使用指南 <span style="font-size:11px; color:#a1a1aa; font-weight:normal;">(按住拖拽)</span></span>
            <span id="ost-help-close-btn" style="cursor:pointer; color:#ef4444; font-size:14px; font-weight:bold; padding:0 4px;">✖</span>
        </div>
        
        <div style="margin-bottom:12px;">
            <strong style="color:#a855f7; font-size:13px;">▶️ 主悬浮窗</strong><br>
            <span style="color:#e4e4e7;">▶️ / ⏸️</span> : 播放与暂停<br>
            <span style="color:#e4e4e7;">⏭️</span> : 切换下一首<br>
            <span style="color:#e4e4e7;">🔁 / 🔂</span> : 列表循环 / 单曲循环<br>
            <span style="color:#e4e4e7;">⚙️</span> : 打开歌单设置面板<br>
            <span style="color:#e4e4e7;">🔽</span> : 最小化悬浮窗（点击恢复）<br>
            <span style="color:#a1a1aa; font-size:11px;">* 按住上方信息栏或空白处可自由拖拽位置。</span>
        </div>

        <div style="margin-bottom:12px;">
            <strong style="color:#60a5fa; font-size:13px;">🔗 自定义歌单</strong><br>
            <span style="color:#e4e4e7;">➕ 直链</span> : 填入音频直链 (支持换行批量)。<br>
            <span style="color:#e4e4e7;">📁 本地</span> : 导入电脑/手机里的本地音频，将无缝保存在浏览器安全缓存中。<br>
            <span style="color:#e4e4e7;">☰</span> : 按住可上下拖拽调整播放顺序。<br>
            <span style="color:#e4e4e7;">✏️</span> : 重命名，让冗长的链接变好看。<br>
            <span style="color:#e4e4e7;">❌</span> : 从列表中移除歌曲。
        </div>

        <div style="margin-bottom:12px;">
            <strong style="color:#10b981; font-size:13px;">🌐 在线搜索</strong><br>
            输入歌名或歌手即可搜索。<br>
            点击搜索结果，系统会自动解析直链并添加到下方列表中。<br>
            <span style="color:#ef4444; font-size:11px;">* 注意: 版权受限或VIP歌曲可能无法解析。</span>
        </div>

        <div>
            <strong style="color:#fbbf24; font-size:13px;">💾 保存与丢弃</strong><br>
            点击面板底部的 <b>"保存并应用"</b> 将立即保存当前列表并生效。若手滑误删或弄乱列表，直接点击右上角 <b>✖</b> 关闭，修改将被安全丢弃，不影响原歌单。
        </div>
    </div>
    `;
    
    $('body').append(playerHTML);

    const playerContainer = $('#ost-player-container');
    const settingsPanel = $('#ost-floating-settings');
    const helpModal = $('#ost-help-modal'); 
    const playBtn = playerContainer.find('#ost-play-btn');
    const nextBtn = playerContainer.find('#ost-next-btn');
    const loopBtn = playerContainer.find('#ost-loop-btn'); 
    const minBtn = playerContainer.find('#ost-min-btn');
    const trackNum = playerContainer.find('#ost-track-num');

    // =====================
    // 面板全局拖拽逻辑封装 (适配设置面板 & 指南弹窗)
    // =====================
    function makePanelDraggable(panelDOM, handleDOM) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        handleDOM.addEventListener('pointerdown', (e) => {
            // 如果点到的是按钮，不触发拖拽
            if (e.target.closest('#ost-close-btn, #ost-help-btn, #ost-help-close-btn')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = panelDOM.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            // 锁定绝对位置，清除原本的居中对齐带来的影响
            panelDOM.style.transform = 'none';
            panelDOM.style.right = 'auto';
            panelDOM.style.bottom = 'auto';
            panelDOM.style.margin = '0';
            
            panelDOM.style.left = initialX + 'px';
            panelDOM.style.top = initialY + 'px';
            
            handleDOM.setPointerCapture(e.pointerId);
            handleDOM.style.cursor = 'grabbing';
        });

        handleDOM.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); // 防止手机端拖拽时页面跟着滚动
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panelDOM.style.left = (initialX + dx) + 'px';
            panelDOM.style.top = (initialY + dy) + 'px';
        });

        const endDrag = (e) => {
            if (isDragging) {
                isDragging = false;
                handleDOM.releasePointerCapture(e.pointerId);
                handleDOM.style.cursor = 'grab';
            }
        };
        handleDOM.addEventListener('pointerup', endDrag);
        handleDOM.addEventListener('pointercancel', endDrag);
    }

    // 绑定设置面板的头部拖拽
    makePanelDraggable(settingsPanel[0], document.getElementById('ost-settings-header'));
    // 绑定指南弹窗的头部拖拽
    makePanelDraggable(helpModal[0], document.getElementById('ost-help-header'));

    // =====================
    // 弹窗交互绑定
    // =====================
    $('#ost-help-btn').on('click', () => helpModal.fadeIn(200));
    $('#ost-help-close-btn').on('click', () => helpModal.fadeOut(200));

    // =====================
    // 主悬浮窗的拖拽逻辑
    // =====================
    const playerDOM = playerContainer[0];
    let isPlayerDragging = false, isPlayerMoved = false; 
    let pStartX, pStartY, pInitialX, pInitialY;
    playerDOM.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input, .ost-edit-btn, .ost-delete-btn')) return; 
        isPlayerDragging = true; isPlayerMoved = false; 
        pStartX = e.clientX; pStartY = e.clientY;
        const rect = playerDOM.getBoundingClientRect();
        pInitialX = rect.left; pInitialY = rect.top;
        playerDOM.style.right = 'auto'; playerDOM.style.left = pInitialX + 'px'; playerDOM.style.top = pInitialY + 'px';
        playerDOM.style.transition = 'none'; playerDOM.setPointerCapture(e.pointerId);
    });
    playerDOM.addEventListener('pointermove', (e) => {
        if (!isPlayerDragging) return;
        const dx = e.clientX - pStartX, dy = e.clientY - pStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isPlayerMoved = true;
        playerDOM.style.left = (pInitialX + dx) + 'px'; playerDOM.style.top = (pInitialY + dy) + 'px';
    });
    const playerEndDrag = (e) => { if (isPlayerDragging) { isPlayerDragging = false; playerDOM.style.transition = ''; playerDOM.releasePointerCapture(e.pointerId); }};
    playerDOM.addEventListener('pointerup', playerEndDrag); playerDOM.addEventListener('pointercancel', playerEndDrag);
    minBtn.on('click', (e) => { e.stopPropagation(); playerContainer.addClass('minimized'); });
    playerContainer.on('click', function() { if ($(this).hasClass('minimized') && !isPlayerMoved) $(this).removeClass('minimized'); });

    // =====================
    // 异步播放核心逻辑
    // =====================
    async function applyAndPlayTrack(index, autoPlay = true) {
        if (currentPlaybackList.length === 0) return;
        const item = currentPlaybackList[index];
        
        if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
        
        audio.pause();
        let src = "";
        
        if (item.type === 'local') {
            const file = await OST_DB.get(item.id);
            if (file) {
                currentBlobUrl = URL.createObjectURL(file);
                src = currentBlobUrl;
            } else {
                console.error("[OST Player] Local file not found in DB:", item.name);
                src = ""; 
            }
        } else {
            src = item.url;
        }

        audio.src = src;
        localStorage.setItem("ost_current_index", index);
        updateTrackInfo();

        if (autoPlay && src) {
            audio.play().then(() => {
                localStorage.setItem("ost_playing", "true"); playBtn.text("⏸️");
            }).catch(err => {
                console.log("[OST Player] 播放失败:", err); playBtn.text("▶️");
            });
        }
    }

    function updateTrackInfo() {
        if (currentPlaybackList.length === 0) {
            trackNum.text("No Tracks");
            playerContainer.find('.ost-title').text("ARCHIVE_OST").css('max-width', 'none');
            return;
        }
        let displayNum = (currentIndex + 1).toString().padStart(2, '0');
        trackNum.text(`Track ${displayNum} / ${currentPlaybackList.length}`);
        
        const currentItem = currentPlaybackList[currentIndex];
        const displayTitle = currentItem.name && currentItem.name !== currentItem.url ? currentItem.name : "ARCHIVE_OST";
        
        if (displayTitle !== "ARCHIVE_OST") {
            playerContainer.find('.ost-title').text(displayTitle).css({
                'white-space': 'nowrap', 'overflow': 'hidden', 'text-overflow': 'ellipsis',
                'display': 'inline-block', 'max-width': '95px', 'vertical-align': 'bottom'
            });
        } else {
            playerContainer.find('.ost-title').text("ARCHIVE_OST").css('max-width', 'none');
        }
    }
    
    if (currentPlaybackList.length > 0) applyAndPlayTrack(currentIndex, wasPlaying);
    else updateTrackInfo();

    audio.addEventListener("playing", () => localStorage.setItem("ost_playing", "true"));
    audio.addEventListener("error", () => console.log("[OST Player] 音频错误:", audio.error));
    
    playBtn.on('click', function() {
        if (currentPlaybackList.length === 0) {
            alert("当前激活的歌单为空，请先添加音乐并保存！"); settingsPanel.show(); return;
        }
        if (audio.paused) {
            if(!audio.src || audio.src.endsWith(window.location.host + "/")) applyAndPlayTrack(currentIndex, true);
            else { audio.play(); playBtn.text("⏸️"); localStorage.setItem("ost_playing", "true"); }
        } else {
            audio.pause(); playBtn.text("▶️"); localStorage.setItem("ost_playing", "false");
        }
    });

    nextBtn.on('click', function() {
        if (currentPlaybackList.length === 0) return;
        currentIndex = (currentIndex + 1) % currentPlaybackList.length;
        applyAndPlayTrack(currentIndex, true);
    });

    loopBtn.on('click', function() {
        loopMode = loopMode === "list" ? "single" : "list";
        loopBtn.text(loopMode === "single" ? "🔂" : "🔁");
        localStorage.setItem("ost_loop_mode", loopMode);
    });

    audio.addEventListener('ended', () => {
        if (currentPlaybackList.length === 0) return;
        if (loopMode === "single") { audio.currentTime = 0; audio.play().catch(e => console.log(e)); } 
        else { nextBtn.click(); }
    });

    // =====================
    // 灵活闭包设置界面 & 双列表渲染逻辑
    // =====================
    let tempPlaylistDirect = [...playlistDirect]; 
    let tempPlaylistSearch = [...playlistSearch]; 
    let isListDragging = false; 

    function renderDraggableList(containerId, tempArray) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        tempArray.forEach((item, index) => {
            if (!item._uid) item._uid = Math.random().toString(36).substring(2, 9);

            const li = document.createElement('li');
            li.className = 'ost-playlist-item';
            li.setAttribute('data-uid', item._uid);
            li.style.cssText = "display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid #27272a; background: #18181b; user-select: none; box-sizing: border-box;";
            
            const typeIcon = item.type === 'local' ? '📁' : (item.type === 'url' ? '🔗' : '🎵');
            const displayText = item.name || item.url;

            li.innerHTML = `
                <span class="ost-drag-handle" title="按住拖动" style="cursor: grab; padding-right: 12px; color: #52525b; font-size: 14px; touch-action: none;">☰</span>
                <span style="font-size:10px; margin-right:6px;" title="${item.type}">${typeIcon}</span>
                <span class="ost-item-text" title="${displayText}" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #a1a1aa; font-size: 11px;">${displayText}</span>
                <span class="ost-edit-btn" title="修改歌名" style="cursor: pointer; color: #60a5fa; margin-left: 8px; padding: 2px 4px;">✏️</span>
                <span class="ost-delete-btn" title="删除" style="cursor: pointer; color: #ef4444; margin-left: 2px; padding: 2px 4px;">❌</span>
            `;

            // 重命名逻辑
            li.querySelector('.ost-edit-btn').addEventListener('click', () => {
                const currentName = item.name || item.url;
                const newName = prompt("请输入自定义歌名 (例如: 歌名 - 歌手):", currentName);
                if (newName !== null && newName.trim() !== "") {
                    item.name = newName.trim();
                    updateAllUI(); 
                }
            });

            // 删除逻辑
            li.querySelector('.ost-delete-btn').addEventListener('click', () => {
                tempArray.splice(index, 1);
                renderDraggableList(containerId, tempArray);
            });

            // 拖拽逻辑
            const handle = li.querySelector('.ost-drag-handle');
            handle.addEventListener('pointerdown', (e) => {
                if (isListDragging) return;
                e.preventDefault(); handle.setPointerCapture(e.pointerId); isListDragging = true; 
                if (navigator.vibrate) navigator.vibrate(50); 
                
                document.querySelectorAll('.ost-drag-clone, .ost-drag-placeholder').forEach(el => el.remove());
                const rect = li.getBoundingClientRect();
                const clone = li.cloneNode(true); 
                clone.classList.add('ost-drag-clone');
                clone.style.cssText = `position:fixed; top:${rect.top}px; left:${rect.left}px; width:${rect.width}px; height:${rect.height}px; z-index:999999; background:#27272a; box-shadow:0 12px 24px rgba(0,0,0,0.8); border:1px solid #a855f7; border-radius:6px; opacity:0.98; pointer-events:none;`;
                document.body.appendChild(clone); 

                const placeholder = document.createElement('li');
                placeholder.className = 'ost-playlist-item ost-drag-placeholder';
                placeholder.style.cssText = li.style.cssText + 'background:rgba(168, 85, 247, 0.1); opacity:0;';
                li.parentNode.insertBefore(placeholder, li.nextSibling);

                const originalCssText = li.style.cssText; 
                li.style.cssText += 'opacity:0; height:0px; padding:0px; border:none; overflow:hidden; pointer-events:none;';

                const startY = e.clientY;
                const onPointerMove = (moveEvt) => {
                    clone.style.transform = `translate3d(0, ${moveEvt.clientY - startY}px, 0)`;
                    const siblings = [...container.querySelectorAll('.ost-playlist-item:not(.ost-drag-placeholder)')].filter(el => el !== li);
                    let nextSib = siblings.find(sib => moveEvt.clientY < sib.getBoundingClientRect().top + sib.getBoundingClientRect().height / 2);
                    if (nextSib !== placeholder.nextElementSibling) container.insertBefore(placeholder, nextSib);
                };

                const cleanupDrag = (upEvt) => {
                    handle.releasePointerCapture(upEvt.pointerId); isListDragging = false; 
                    if (navigator.vibrate) navigator.vibrate(30); 
                    clone.remove(); container.insertBefore(li, placeholder); placeholder.remove();
                    li.style.cssText = originalCssText;
                    handle.removeEventListener('pointermove', onPointerMove); handle.removeEventListener('pointerup', cleanupDrag); handle.removeEventListener('pointercancel', cleanupDrag);
                    
                    const currentDOMItems = [...container.querySelectorAll('.ost-playlist-item')];
                    const newTempArray = [];
                    currentDOMItems.forEach(domLi => {
                        const uid = domLi.getAttribute('data-uid');
                        const matchingItem = tempArray.find(obj => obj._uid === uid);
                        if (matchingItem) newTempArray.push(matchingItem);
                    });
                    tempArray.length = 0;
                    tempArray.push(...newTempArray);
                };

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', cleanupDrag); handle.addEventListener('pointercancel', cleanupDrag);
            });

            container.appendChild(li);
        });
    }

    function updateAllUI() {
        renderDraggableList('ost-playlist-direct-container', tempPlaylistDirect);
        renderDraggableList('ost-playlist-search-container', tempPlaylistSearch);
    }
    updateAllUI();

    const closeSettings = () => {
        tempPlaylistDirect = JSON.parse(JSON.stringify(playlistDirect)); 
        tempPlaylistSearch = JSON.parse(JSON.stringify(playlistSearch));
        updateAllUI();
        settingsPanel.hide();
    };

    playerContainer.find('#ost-settings-btn').on('click', () => {
        if (settingsPanel.is(':visible')) closeSettings();
        else settingsPanel.show();
    });
    settingsPanel.find('#ost-close-btn').on('click', closeSettings);

    let playerMode = activeMode; 
    const modeDirectBtn = settingsPanel.find('#ost-mode-direct');
    const modeSearchBtn = settingsPanel.find('#ost-mode-search');
    const directUI = settingsPanel.find('#ost-direct-ui');
    const searchUI = settingsPanel.find('#ost-search-ui');

    function switchTo(mode) {
        playerMode = mode;
        if(mode === "direct") {
            modeDirectBtn.css({ opacity: 1, background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7' });
            modeSearchBtn.css({ opacity: 0.5, background: 'transparent', border: 'none' });
            directUI.show(); searchUI.hide();
        } else {
            modeSearchBtn.css({ opacity: 1, background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7' });
            modeDirectBtn.css({ opacity: 0.5, background: 'transparent', border: 'none' });
            searchUI.show(); directUI.hide();
        }
    }
    modeDirectBtn.on('click', () => switchTo("direct"));
    modeSearchBtn.on('click', () => switchTo("search"));
    switchTo(playerMode);

    settingsPanel.find('.ost-sort-btn').on('click', function() {
        const type = $(this).data('sort');
        const targetArray = playerMode === "direct" ? tempPlaylistDirect : tempPlaylistSearch;
        const getVal = (item) => item.name || item.url;
        if (type === 'az') targetArray.sort((a,b) => getVal(a).localeCompare(getVal(b)));
        if (type === 'za') targetArray.sort((a,b) => getVal(b).localeCompare(getVal(a)));
        if (type === 'reverse') targetArray.reverse();
        if (type === 'random') targetArray.sort(() => Math.random() - 0.5);
        updateAllUI();
    });

    // =====================
    // 手动直链 & 本地导入逻辑
    // =====================
    const newLinkInput = settingsPanel.find('#ost-new-link')[0];
    settingsPanel.find('#ost-add-url-btn').on('click', () => {
        const inputVal = newLinkInput.value.trim();
        if (inputVal) {
            const newLinks = inputVal.split('\n').map(l => l.trim()).filter(l => l !== '').map(url => ({ type: 'url', name: url, url: url }));
            tempPlaylistDirect.push(...newLinks);
            newLinkInput.value = '';
            updateAllUI();
        }
    });

    const fileInput = settingsPanel.find('#ost-local-upload')[0];
    settingsPanel.find('#ost-add-local-btn').on('click', () => fileInput.click());
    
    $(fileInput).on('change', async function(e) {
        const files = e.target.files;
        if (!files.length) return;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const uniqueId = 'local_' + Date.now() + '_' + i;
            
            try {
                await OST_DB.save(uniqueId, file);
                tempPlaylistDirect.push({ type: 'local', id: uniqueId, name: file.name.replace(/\.[^/.]+$/, "") });
            } catch (err) {
                console.error("保存本地文件失败:", err);
                alert(`文件 ${file.name} 保存失败`);
            }
        }
        updateAllUI();
        fileInput.value = ''; 
    });

    // =====================
    // 在线搜索与 API 接入逻辑
    // =====================
    const searchInput = settingsPanel.find('#ost-search-input');
    const searchBtn = settingsPanel.find('#ost-do-search-btn');
    const searchResults = settingsPanel.find('#ost-search-results');

    searchBtn.on('click', async function() {
        const keyword = searchInput.val().trim();
        if (!keyword) return;
        searchResults.html('<li style="color:#a1a1aa; padding:8px; font-size:11px; text-align:center;">🔍 搜索中...</li>');

        try {
            const response = await fetch(`https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(keyword)}`);
            const data = await response.json();
            searchResults.empty();
            
            const songs = data.data || data; 
            if (!songs || !songs.length) {
                searchResults.html('<li style="color:#a1a1aa; padding:8px; font-size:11px; text-align:center;">未找到结果，换个词试试？</li>'); return;
            }

            songs.forEach(song => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 8px 12px; border-bottom: 1px solid #27272a; color: #e4e4e7; font-size: 11px; cursor: pointer; transition: background 0.2s;";
                li.onmouseenter = () => li.style.background = 'rgba(168, 85, 247, 0.1)';
                li.onmouseleave = () => li.style.background = 'transparent';
                
                const originalText = `${song.name || '未知歌曲'} - ${song.artist || '未知歌手'}`;
                li.innerText = originalText;
                
                li.addEventListener('click', async () => {
                    if (!song.id) { alert('⚠️ 缺少ID'); return; }
                    li.innerText = '⏳ 正在解析直链...'; li.style.color = '#fbbf24';

                    try {
                        const urlReq = await fetch(`https://music-api.gdstudio.xyz/api.php?types=url&id=${song.id}&source=${song.source || 'netease'}`);
                        const urlData = await urlReq.json();
                        let finalUrl = urlData.url || (urlData.data && urlData.data.url) || null;

                        if (finalUrl && typeof finalUrl === 'string' && finalUrl.startsWith('http')) {
                            tempPlaylistSearch.push({ type: 'url', name: originalText, url: finalUrl });
                            updateAllUI(); 
                            li.innerText = '✅ 已添加到搜索歌单'; li.style.color = '#10b981';
                            setTimeout(() => { li.innerText = originalText; li.style.color = '#e4e4e7'; }, 1500);
                        } else {
                            li.innerText = '⚠️ 暂无版权或需VIP'; li.style.color = '#ef4444';
                            setTimeout(() => { li.innerText = originalText; li.style.color = '#e4e4e7'; }, 2000);
                        }
                    } catch (err) {
                        li.innerText = '❌ 网络请求失败'; li.style.color = '#ef4444';
                        setTimeout(() => { li.innerText = originalText; li.style.color = '#e4e4e7'; }, 2000);
                    }
                });
                searchResults.append(li);
            });
        } catch (err) {
            searchResults.html('<li style="color:#ef4444; padding:8px; font-size:11px; text-align:center;">❌ 搜索失败</li>');
        }
    });

    searchInput.on('keypress', function (e) { if (e.which == 13) searchBtn.click(); });

    // =====================
    // 统一保存与智能清理逻辑
    // =====================
    settingsPanel.find('#ost-save-btn').off('click').on('click', async function() {
        playlistDirect = tempPlaylistDirect.map(item => { const { _uid, ...rest } = item; return rest; });
        playlistSearch = tempPlaylistSearch.map(item => { const { _uid, ...rest } = item; return rest; });
        activeMode = playerMode; 

        localStorage.setItem("ost_custom_playlist", JSON.stringify(playlistDirect));
        localStorage.setItem("ost_playlist_search", JSON.stringify(playlistSearch));
        localStorage.setItem("ost_active_mode", activeMode);
        
        currentPlaybackList = activeMode === "direct" ? playlistDirect : playlistSearch;
        
        if (currentPlaybackList.length > 0) {
            currentIndex = 0;
            applyAndPlayTrack(0, false); 
        } else {
            audio.pause(); audio.src = ""; updateTrackInfo(); playBtn.text('▶️');
        }
        
        try {
            const validLocalIds = new Set(playlistDirect.filter(item => item.type === 'local').map(item => item.id));
            const allDbKeys = await OST_DB.getAllKeys();
            for (let key of allDbKeys) {
                if (!validLocalIds.has(key)) {
                    await OST_DB.delete(key);
                    console.log(`[OST Player] 清理废弃本地文件: ${key}`);
                }
            }
        } catch (err) { console.error("[OST Player] 清理废弃文件失败", err); }

        settingsPanel.hide();
        alert(`✅ ${activeMode === 'direct' ? '🔗 自定义' : '🌐 搜索'}歌单已保存！`);
    });
});
