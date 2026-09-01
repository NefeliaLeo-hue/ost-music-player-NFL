console.log("[OST TEST] index.js loaded");

if (typeof jQuery === "undefined") {
    console.error("[OST Player] jQuery missing!");
} else {
    console.log("[OST Player] jQuery OK");
}

jQuery(async function () {
    console.log("[OST Player] INIT START");
    
    if ($("#ost-player-container").length) {
        console.log("[OST Player] Already loaded");
        return;
    }
    console.log("[OST Player] Initialized");

    // =====================
    // 数据读取与初始化
    // =====================
    let savedLinks = localStorage.getItem("ost_custom_playlist");
    let playlist = savedLinks ? savedLinks.split("\n").filter(link => link.trim() !== "") : [];
    let currentIndex = Number(localStorage.getItem("ost_current_index")) || 0;
    let loopMode = localStorage.getItem("ost_loop_mode") || "list"; 
    
    let audio = new Audio(playlist.length ? playlist[currentIndex] : "");
    audio.volume = Number(localStorage.getItem("ost_volume")) || 0.5;
    let wasPlaying = localStorage.getItem("ost_playing") === "true";

    audio.addEventListener("loadedmetadata", () => console.log("歌曲长度:", audio.duration));
    audio.addEventListener("error", () => console.log("[OST Player] 音频错误:", audio.error));
    audio.addEventListener("volumechange", () => localStorage.setItem("ost_volume", audio.volume));

    // =====================
    // 注入 HTML (主悬浮窗 + 双模设置面板)
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

    <div id="ost-floating-settings" style="display:none; position:fixed; top:80px; right:20px; width:280px; background:rgba(24,24,27,0.95); border:1px solid #3f3f46; border-radius:12px; padding:15px; box-shadow:0 8px 16px rgba(0,0,0,0.8); z-index:999999; backdrop-filter:blur(8px); font-family:system-ui, sans-serif; box-sizing:border-box;">
        <div style="font-size:13px; color:#e4e4e7; font-weight:bold; margin-bottom:12px;">🎵 播放列表设置</div>
        
        <!-- 模式切换开关 -->
        <div style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #3f3f46; padding-bottom: 10px;">
            <div id="ost-mode-direct" style="flex: 1; text-align: center; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🔗 直链歌单</div>
            <div id="ost-mode-search" style="flex: 1; text-align: center; opacity: 0.5; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🌐 在线搜索</div>
        </div>

        <!-- ================= 直链模式 UI ================= -->
        <div id="ost-direct-ui">
            <div style="font-size:10px; color:#a1a1aa; margin-bottom:6px;">添加新歌曲 (直链)：</div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="ost-new-link" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="粘贴链接...">
                <button id="ost-add-btn" style="background:#4f46e5; border:none; color:white; padding:0 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">➕ 添 加</button>
            </div>

            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                <button class="ost-sort-btn" data-sort="az" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">A-Z</button>
                <button class="ost-sort-btn" data-sort="za" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">Z-A</button>
                <button class="ost-sort-btn" data-sort="reverse" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">反转</button>
                <button class="ost-sort-btn" data-sort="random" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">打乱</button>
            </div>

            <ul id="ost-playlist-container" style="list-style: none; padding: 0; margin: 0; max-height: 180px; overflow-y: auto; overflow-x: hidden; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;">
                <!-- JS 动态渲染列表 -->
            </ul>
        </div>

        <!-- ================= 在线搜索模式 UI ================= -->
        <div id="ost-search-ui" style="display: none;">
            <div style="font-size:10px; color:#a1a1aa; margin-bottom:6px;">搜索歌曲并添加到歌单：</div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="ost-search-input" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="输入歌名或歌手...">
                <button id="ost-do-search-btn" style="background:#4f46e5; border:none; color:white; padding:0 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">🔍 搜 索</button>
            </div>
            <ul id="ost-search-results" style="list-style: none; padding: 0; margin: 0; max-height: 140px; overflow-y: auto; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;">
                <!-- 搜索结果动态渲染 -->
            </ul>
        </div>
        
        <button id="ost-save-btn" style="margin-top:15px; width:100%; background:linear-gradient(135deg, #a855f7, #6366f1); border:none; color:white; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">💾 保存并应用</button>
    </div>
    `;
    
    $('body').append(playerHTML);

    // 绝对作用域锁定
    const playerContainer = $('#ost-player-container');
    const settingsPanel = $('#ost-floating-settings');

    const playBtn = playerContainer.find('#ost-play-btn');
    const nextBtn = playerContainer.find('#ost-next-btn');
    const loopBtn = playerContainer.find('#ost-loop-btn'); 
    const settingsBtn = playerContainer.find('#ost-settings-btn');
    const minBtn = playerContainer.find('#ost-min-btn');
    const trackNum = playerContainer.find('#ost-track-num');

    const saveBtn = settingsPanel.find('#ost-save-btn');
    const newLinkInput = settingsPanel.find('#ost-new-link')[0];
    const addBtn = settingsPanel.find('#ost-add-btn')[0];
    const playlistContainer = settingsPanel.find('#ost-playlist-container')[0];

    // =====================
    // 拖拽与最小化逻辑 (主悬浮窗)
    // =====================
    const playerDOM = playerContainer[0];
    let isDragging = false;
    let isMoved = false; 
    let startX, startY, initialX, initialY;

    playerDOM.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input')) return; 
        isDragging = true;
        isMoved = false; 
        startX = e.clientX;
        startY = e.clientY;
        const rect = playerDOM.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        playerDOM.style.right = 'auto'; 
        playerDOM.style.left = initialX + 'px';
        playerDOM.style.top = initialY + 'px';
        playerDOM.style.transition = 'none'; 
        playerDOM.setPointerCapture(e.pointerId);
    });

    playerDOM.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isMoved = true;
        playerDOM.style.left = (initialX + dx) + 'px';
        playerDOM.style.top = (initialY + dy) + 'px';
    });

    const endDrag = (e) => {
        if (isDragging) {
            isDragging = false;
            playerDOM.style.transition = '';
            playerDOM.releasePointerCapture(e.pointerId);
        }
    };
    playerDOM.addEventListener('pointerup', endDrag);
    playerDOM.addEventListener('pointercancel', endDrag);

    minBtn.on('click', function(e) {
        e.stopPropagation(); 
        playerContainer.addClass('minimized');
    });

    playerContainer.on('click', function(e) {
        if ($(this).hasClass('minimized') && !isMoved) {
            $(this).removeClass('minimized');
        }
    });

    // =====================
    // 播放核心逻辑
    // =====================
    let playTimer = null;
    audio.addEventListener("playing", () => clearTimeout(playTimer));
    audio.addEventListener("waiting", () => {
        clearTimeout(playTimer);
        playTimer = setTimeout(() => {
            console.log("[OST Player] 音乐加载超时，自动跳过");
            nextBtn.click();
        }, 20000);
    });

    function updateTrackInfo() {
        if (playlist.length === 0) {
            trackNum.text("No Tracks");
            return;
        }
        let displayNum = (currentIndex + 1).toString().padStart(2, '0');
        trackNum.text(`Track ${displayNum} / ${playlist.length}`);
    }
    updateTrackInfo();

    playBtn.on('click', function() {
        if (playlist.length === 0) {
            alert("请先点击 ⚙️ 齿轮按钮，添加音乐！");
            settingsPanel.show();
            return;
        }
        if (audio.paused) {
            audio.play().then(() => {
                localStorage.setItem("ost_playing", "true");
                playBtn.text("⏸️");
            }).catch(err => {
                console.log("[OST Player] 播放失败:", err);
                playBtn.text("▶️");
            });
        } else {
            audio.pause();
            localStorage.setItem("ost_playing", "false");
            playBtn.text("▶️");
        }
    });

    nextBtn.on('click', function() {
        if (playlist.length === 0) return;
        audio.pause();
        currentIndex = (currentIndex + 1) % playlist.length;
        localStorage.setItem("ost_current_index", currentIndex);
        audio.src = playlist[currentIndex];
        audio.play();
        playBtn.text('⏸️');
        updateTrackInfo();
    });

    loopBtn.on('click', function() {
        if (loopMode === "list") {
            loopMode = "single";
            loopBtn.text("🔂");
        } else {
            loopMode = "list";
            loopBtn.text("🔁");
        }
        localStorage.setItem("ost_loop_mode", loopMode);
    });

    audio.addEventListener('ended', () => {
        if (playlist.length === 0) return;
        if (loopMode === "single") {
            audio.currentTime = 0;
            audio.play().catch(err => console.log("重播失败:", err));
        } else {
            nextBtn.click();
        }
    });

    if (wasPlaying && playlist.length > 0) {
        audio.play().then(() => playBtn.text("⏸️")).catch(() => console.log("自动播放被拦截"));
    }

    settingsBtn.on('click', () => settingsPanel.toggle());

    // =====================
    // 歌单排序与拖拽逻辑
    // =====================
    let tempPlaylist = [...playlist]; 
    let isListDragging = false; 

    function renderPlaylist() {
        playlistContainer.innerHTML = '';
        
        tempPlaylist.forEach((link, index) => {
            const li = document.createElement('li');
            li.className = 'ost-playlist-item';
            li.style.cssText = "display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid #27272a; background: #18181b; user-select: none; box-sizing: border-box;";
            
            li.innerHTML = `
                <span class="ost-drag-handle" title="按住拖动" style="cursor: grab; padding-right: 12px; color: #52525b; font-size: 14px; touch-action: none;">☰</span>
                <span class="ost-item-text" title="${link}" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; color: #a1a1aa; font-size: 11px;">${link}</span>
                <span class="ost-delete-btn" title="删除" style="cursor: pointer; color: #ef4444; margin-left: 8px; padding: 2px 6px;">❌</span>
            `;

            li.querySelector('.ost-delete-btn').addEventListener('click', () => {
                tempPlaylist.splice(index, 1);
                renderPlaylist();
            });

            const handle = li.querySelector('.ost-drag-handle');
            
            handle.addEventListener('pointerdown', (e) => {
                if (isListDragging) return;
                e.preventDefault(); 
                handle.setPointerCapture(e.pointerId); 
                isListDragging = true; 
                
                if (navigator.vibrate) navigator.vibrate(50); 
                document.querySelectorAll('.ost-drag-clone, .ost-drag-placeholder').forEach(el => el.remove());
                const rect = li.getBoundingClientRect();

                const clone = li.cloneNode(true); 
                clone.classList.add('ost-drag-clone');
                clone.style.position = 'fixed';
                clone.style.top = rect.top + 'px';
                clone.style.left = rect.left + 'px';
                clone.style.width = rect.width + 'px';
                clone.style.height = rect.height + 'px';
                clone.style.margin = '0';
                clone.style.zIndex = '999999'; 
                clone.style.background = '#27272a';
                clone.style.boxShadow = '0 12px 24px rgba(0,0,0,0.8)';
                clone.style.border = '1px solid #a855f7'; 
                clone.style.borderRadius = '6px';
                clone.style.opacity = '0.98';
                clone.style.pointerEvents = 'none'; 
                clone.style.transform = 'translate3d(0px, 0px, 0px) scale(1.02)';
                clone.style.willChange = 'transform';
                document.body.appendChild(clone); 

                const placeholder = document.createElement('li');
                placeholder.className = 'ost-playlist-item ost-drag-placeholder';
                placeholder.style.cssText = li.style.cssText;
                placeholder.style.background = 'rgba(168, 85, 247, 0.1)';
                placeholder.innerHTML = li.innerHTML;
                [...placeholder.children].forEach(child => child.style.opacity = '0'); 
                li.parentNode.insertBefore(placeholder, li.nextSibling);

                const originalCssText = li.style.cssText; 
                li.style.opacity = '0';
                li.style.height = '0px';
                li.style.padding = '0px';
                li.style.border = 'none';
                li.style.overflow = 'hidden';
                li.style.pointerEvents = 'none';

                const listStartX = e.clientX;
                const listStartY = e.clientY;

                const onPointerMove = (moveEvent) => {
                    const dx = moveEvent.clientX - listStartX;
                    const dy = moveEvent.clientY - listStartY;
                    clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;

                    const siblings = [...playlistContainer.querySelectorAll('.ost-playlist-item:not(.ost-drag-placeholder)')].filter(el => el !== li);
                    let nextSibling = siblings.find(sibling => {
                        const sRect = sibling.getBoundingClientRect();
                        return moveEvent.clientY < sRect.top + sRect.height / 2;
                    });

                    if (nextSibling !== placeholder.nextElementSibling) {
                        playlistContainer.insertBefore(placeholder, nextSibling);
                    }
                };

                const cleanupDrag = (upEvent) => {
                    handle.releasePointerCapture(upEvent.pointerId);
                    isListDragging = false; 
                    if (navigator.vibrate) navigator.vibrate(30); 
                    clone.remove(); 
                    playlistContainer.insertBefore(li, placeholder);
                    placeholder.remove();
                    li.style.cssText = originalCssText;
                    handle.removeEventListener('pointermove', onPointerMove);
                    handle.removeEventListener('pointerup', cleanupDrag);
                    handle.removeEventListener('pointercancel', cleanupDrag);
                    const currentItems = [...playlistContainer.querySelectorAll('.ost-item-text')];
                    tempPlaylist = currentItems.map(item => item.getAttribute('title'));
                };

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', cleanupDrag);
                handle.addEventListener('pointercancel', cleanupDrag);
            });

            playlistContainer.appendChild(li);
        });
    }

    addBtn.addEventListener('click', () => {
        const inputVal = newLinkInput.value.trim();
        if (inputVal) {
            const newLinks = inputVal.split('\n').map(l => l.trim()).filter(l => l !== '');
            tempPlaylist.push(...newLinks);
            newLinkInput.value = '';
            renderPlaylist();
        }
    });

    settingsPanel.find('.ost-sort-btn').on('click', function() {
        const type = $(this).data('sort');
        if (type === 'az') tempPlaylist.sort();
        if (type === 'za') tempPlaylist.sort().reverse();
        if (type === 'reverse') tempPlaylist.reverse();
        if (type === 'random') tempPlaylist.sort(() => Math.random() - 0.5);
        renderPlaylist();
    });

    renderPlaylist();

    // =====================
    // 双标签页 (直链 / 搜索) UI切换逻辑
    // =====================
    let playerMode = localStorage.getItem("ost_player_mode") || "direct";
    
    const modeDirectBtn = settingsPanel.find('#ost-mode-direct');
    const modeSearchBtn = settingsPanel.find('#ost-mode-search');
    const directUI = settingsPanel.find('#ost-direct-ui');
    const searchUI = settingsPanel.find('#ost-search-ui');

    function switchToDirectUI() {
        modeDirectBtn.css({ opacity: 1, background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7' });
        modeSearchBtn.css({ opacity: 0.5, background: 'transparent', border: 'none' });
        directUI.show();
        searchUI.hide();
        playerMode = "direct";
    }

    function switchToSearchUI() {
        modeSearchBtn.css({ opacity: 1, background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7' });
        modeDirectBtn.css({ opacity: 0.5, background: 'transparent', border: 'none' });
        searchUI.show();
        directUI.hide();
        playerMode = "search";
    }

    modeDirectBtn.on('click', switchToDirectUI);
    modeSearchBtn.on('click', switchToSearchUI);

    if (playerMode === "search") {
        switchToSearchUI();
    } else {
        switchToDirectUI();
    }

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
            
            // 兼容可能不同的 JSON 结构返回
            const songs = data.data || data; 
            if (!songs || !songs.length) {
                searchResults.html('<li style="color:#a1a1aa; padding:8px; font-size:11px; text-align:center;">未找到结果，换个词试试？</li>');
                return;
            }

            songs.forEach(song => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 8px 12px; border-bottom: 1px solid #27272a; color: #e4e4e7; font-size: 11px; cursor: pointer; transition: background 0.2s;";
                
                // 悬停反馈效果
                li.onmouseenter = () => li.style.background = 'rgba(168, 85, 247, 0.1)';
                li.onmouseleave = () => li.style.background = 'transparent';
                
                li.innerText = `${song.name || '未知歌曲'} - ${song.artist || '未知歌手'}`;
                
                li.addEventListener('click', () => {
                    if(song.url) {
                        tempPlaylist.push(song.url);
                        renderPlaylist(); // 实时更新直链界面的列表
                        
                        // 可视化点击反馈
                        const originalText = li.innerText;
                        li.innerText = '✅ 已添加到歌单';
                        li.style.color = '#10b981';
                        setTimeout(() => {
                            li.innerText = originalText;
                            li.style.color = '#e4e4e7';
                        }, 1000);
                    } else {
                        alert('⚠️ 无法获取该歌曲的直链');
                    }
                });
                
                searchResults.append(li);
            });
        } catch (err) {
            console.error("[OST Player] 搜索失败:", err);
            searchResults.html('<li style="color:#ef4444; padding:8px; font-size:11px; text-align:center;">❌ 搜索失败，请检查网络或 API 状态</li>');
        }
    });

    // 允许回车键触发搜索
    searchInput.on('keypress', function (e) {
        if (e.which == 13) searchBtn.click();
    });

    // =====================
    // 统一保存逻辑
    // =====================
    saveBtn.off('click').on('click', function() {
        localStorage.setItem("ost_player_mode", playerMode);
        
        playlist = [...tempPlaylist];
        localStorage.setItem('ost_custom_playlist', playlist.join('\n'));
        
        if (playlist.length > 0) {
            currentIndex = 0;
            localStorage.setItem("ost_current_index", 0);
            audio.src = playlist[currentIndex];
            audio.pause();
            playBtn.text('▶️');
            updateTrackInfo();
        } else {
            audio.pause();
            audio.src = "";
            updateTrackInfo();
        }
        
        settingsPanel.hide();
        // 想要无打扰体验，可以直接注释掉下面这行 alert
        alert("✅ 歌单保存成功！");
    });
});
