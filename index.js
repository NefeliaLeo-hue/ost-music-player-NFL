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
    // 数据读取与双列表初始化
    // =====================
    // 1. 直链歌单数据
    let savedDirect = localStorage.getItem("ost_custom_playlist");
    let playlistDirect = savedDirect ? savedDirect.split("\n").filter(link => link.trim() !== "") : [];
    
    // 2. 搜索歌单数据 (存为JSON以保留歌名: {name, url})
    let playlistSearch = [];
    let savedSearch = localStorage.getItem("ost_playlist_search");
    if (savedSearch) {
        try { playlistSearch = JSON.parse(savedSearch); } catch(e) { console.error("解析搜索歌单失败", e); }
    }

    // 当前激活模式 ("direct" 或 "search")
    let activeMode = localStorage.getItem("ost_active_mode") || "direct";
    let currentPlaybackList = activeMode === "direct" ? playlistDirect : playlistSearch.map(s => s.url);

    let currentIndex = Number(localStorage.getItem("ost_current_index")) || 0;
    if (currentIndex >= currentPlaybackList.length) currentIndex = 0;
    
    let loopMode = localStorage.getItem("ost_loop_mode") || "list"; 
    
    let audio = new Audio(currentPlaybackList.length ? currentPlaybackList[currentIndex] : "");
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
        <div style="font-size:13px; color:#e4e4e7; font-weight:bold; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span>🎵 播放列表设置</span>
            <span id="ost-close-btn" style="cursor:pointer; color:#a1a1aa; padding:2px 6px; font-size:14px;" title="关闭 (不保存修改)">✖</span>
        </div>
        
        <!-- 模式切换开关 -->
        <div style="display: flex; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid #3f3f46; padding-bottom: 10px;">
            <div id="ost-mode-direct" style="flex: 1; text-align: center; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🔗 直链模式</div>
            <div id="ost-mode-search" style="flex: 1; text-align: center; opacity: 0.5; color:#e4e4e7; font-size:12px; font-weight:bold; cursor:pointer; border-radius:4px; padding:6px 0;">🌐 搜索模式</div>
        </div>

        <!-- 排序工具栏 (全局通用) -->
        <div style="display: flex; gap: 6px; margin-bottom: 12px;">
            <button class="ost-sort-btn" data-sort="az" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">A-Z</button>
            <button class="ost-sort-btn" data-sort="za" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">Z-A</button>
            <button class="ost-sort-btn" data-sort="reverse" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">反转</button>
            <button class="ost-sort-btn" data-sort="random" style="flex:1; background:#27272a; color:#a1a1aa; border:1px solid #3f3f46; border-radius:4px; padding:4px 0; cursor:pointer; font-size:11px;">打乱</button>
        </div>

        <!-- ================= 直链模式 UI ================= -->
        <div id="ost-direct-ui">
            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <input type="text" id="ost-new-link" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="粘贴直链网址...">
                <button id="ost-add-btn" style="background:#4f46e5; border:none; color:white; padding:0 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">➕ 添 加</button>
            </div>
            <div style="font-size:10px; color:#a1a1aa; margin-bottom:6px;">直链歌单：</div>
            <ul id="ost-playlist-direct-container" style="list-style: none; padding: 0; margin: 0; max-height: 160px; overflow-y: auto; overflow-x: hidden; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;">
                <!-- JS 动态渲染直链列表 -->
            </ul>
        </div>

        <!-- ================= 在线搜索模式 UI ================= -->
        <div id="ost-search-ui" style="display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="ost-search-input" style="flex: 1; padding: 6px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; font-size:11px; outline:none;" placeholder="输入歌名或歌手...">
                <button id="ost-do-search-btn" style="background:#4f46e5; border:none; color:white; padding:0 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">🔍 搜 索</button>
            </div>
            <ul id="ost-search-results" style="list-style: none; padding: 0; margin: 0; max-height: 100px; overflow-y: auto; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;">
                <!-- 搜索结果动态渲染 -->
            </ul>

            <div style="font-size:10px; color:#a1a1aa; margin:10px 0 6px;">我的搜索歌单：</div>
            <ul id="ost-playlist-search-container" style="list-style: none; padding: 0; margin: 0; max-height: 120px; overflow-y: auto; overflow-x: hidden; border: 1px solid #3f3f46; border-radius: 6px; background: #18181b;">
                <!-- JS 动态渲染搜索到的已保存列表 -->
            </ul>
        </div>
        
        <button id="ost-save-btn" style="margin-top:15px; width:100%; background:linear-gradient(135deg, #a855f7, #6366f1); border:none; color:white; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">💾 保存并应用当前列表</button>
    </div>
    `;
    
    $('body').append(playerHTML);

    const playerContainer = $('#ost-player-container');
    const settingsPanel = $('#ost-floating-settings');
    const playBtn = playerContainer.find('#ost-play-btn');
    const nextBtn = playerContainer.find('#ost-next-btn');
    const loopBtn = playerContainer.find('#ost-loop-btn'); 
    const minBtn = playerContainer.find('#ost-min-btn');
    const trackNum = playerContainer.find('#ost-track-num');

    // =====================
    // 拖拽与最小化逻辑 (主悬浮窗)
    // =====================
    const playerDOM = playerContainer[0];
    let isDragging = false, isMoved = false; 
    let startX, startY, initialX, initialY;

    playerDOM.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input')) return; 
        isDragging = true; isMoved = false; 
        startX = e.clientX; startY = e.clientY;
        const rect = playerDOM.getBoundingClientRect();
        initialX = rect.left; initialY = rect.top;
        playerDOM.style.right = 'auto'; 
        playerDOM.style.left = initialX + 'px'; playerDOM.style.top = initialY + 'px';
        playerDOM.style.transition = 'none'; 
        playerDOM.setPointerCapture(e.pointerId);
    });

    playerDOM.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX; const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isMoved = true;
        playerDOM.style.left = (initialX + dx) + 'px'; playerDOM.style.top = (initialY + dy) + 'px';
    });

    const endDrag = (e) => {
        if (isDragging) {
            isDragging = false;
            playerDOM.style.transition = '';
            playerDOM.releasePointerCapture(e.pointerId);
        }
    };
    playerDOM.addEventListener('pointerup', endDrag); playerDOM.addEventListener('pointercancel', endDrag);

    minBtn.on('click', (e) => { e.stopPropagation(); playerContainer.addClass('minimized'); });
    playerContainer.on('click', function() {
        if ($(this).hasClass('minimized') && !isMoved) $(this).removeClass('minimized');
    });

    // =====================
    // 播放核心逻辑
    // =====================
    let playTimer = null;
    audio.addEventListener("playing", () => clearTimeout(playTimer));
    audio.addEventListener("waiting", () => {
        clearTimeout(playTimer);
        playTimer = setTimeout(() => {
            console.log("[OST Player] 音乐加载超时，跳过");
            nextBtn.click();
        }, 20000);
    });

    function updateTrackInfo() {
        if (currentPlaybackList.length === 0) {
            trackNum.text("No Tracks");
            playerContainer.find('.ost-title').text("ARCHIVE_OST").css('max-width', 'none');
            return;
        }
        let displayNum = (currentIndex + 1).toString().padStart(2, '0');
        trackNum.text(`Track ${displayNum} / ${currentPlaybackList.length}`);
        
        // 彩蛋：如果是搜索列表，悬浮窗标题直接显示歌名
        if (activeMode === "search" && playlistSearch[currentIndex]) {
            playerContainer.find('.ost-title').text(playlistSearch[currentIndex].name).css({
                'white-space': 'nowrap', 'overflow': 'hidden', 'text-overflow': 'ellipsis',
                'display': 'inline-block', 'max-width': '95px', 'vertical-align': 'bottom'
            });
        } else {
            playerContainer.find('.ost-title').text("ARCHIVE_OST").css('max-width', 'none');
        }
    }
    updateTrackInfo();

    playBtn.on('click', function() {
        if (currentPlaybackList.length === 0) {
            alert("当前激活的歌单为空，请先添加音乐并保存！");
            settingsPanel.show();
            return;
        }
        if (audio.paused) {
            audio.play().then(() => {
                localStorage.setItem("ost_playing", "true"); playBtn.text("⏸️");
            }).catch(err => {
                console.log("[OST Player] 播放失败:", err); playBtn.text("▶️");
            });
        } else {
            audio.pause(); localStorage.setItem("ost_playing", "false"); playBtn.text("▶️");
        }
    });

    nextBtn.on('click', function() {
        if (currentPlaybackList.length === 0) return;
        audio.pause();
        currentIndex = (currentIndex + 1) % currentPlaybackList.length;
        localStorage.setItem("ost_current_index", currentIndex);
        audio.src = currentPlaybackList[currentIndex];
        audio.play(); playBtn.text('⏸️');
        updateTrackInfo();
    });

    loopBtn.on('click', function() {
        loopMode = loopMode === "list" ? "single" : "list";
        loopBtn.text(loopMode === "single" ? "🔂" : "🔁");
        localStorage.setItem("ost_loop_mode", loopMode);
    });

    audio.addEventListener('ended', () => {
        if (currentPlaybackList.length === 0) return;
        if (loopMode === "single") {
            audio.currentTime = 0; audio.play().catch(e => console.log(e));
        } else {
            nextBtn.click();
        }
    });

    if (wasPlaying && currentPlaybackList.length > 0) {
        audio.play().then(() => playBtn.text("⏸️")).catch(() => console.log("拦截"));
    }

    // =====================
    // 灵活闭包设置界面 & 双列表渲染逻辑
    // =====================
    let tempPlaylistDirect = [...playlistDirect]; 
    let tempPlaylistSearch = [...playlistSearch]; 
    let isListDragging = false; 

    // 通用渲染器 (既能渲染纯URL，也能渲染带有歌名的对象)
    function renderDraggableList(containerId, tempArray, isSearchObj) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        tempArray.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'ost-playlist-item';
            li.style.cssText = "display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid #27272a; background: #18181b; user-select: none; box-sizing: border-box;";
            
            const url = isSearchObj ? item.url : item;
            const name = isSearchObj ? item.name : item;

            li.innerHTML = `
                <span class="ost-drag-handle" title="按住拖动" style="cursor: grab; padding-right: 12px; color: #52525b; font-size: 14px; touch-action: none;">☰</span>
                <span class="ost-item-text" data-url="${url}" data-name="${name}" title="${name}" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${isSearchObj ? '' : 'direction: rtl; text-align: left;'} color: #a1a1aa; font-size: 11px;">${name}</span>
                <span class="ost-delete-btn" title="删除" style="cursor: pointer; color: #ef4444; margin-left: 8px; padding: 2px 6px;">❌</span>
            `;

            li.querySelector('.ost-delete-btn').addEventListener('click', () => {
                tempArray.splice(index, 1);
                renderDraggableList(containerId, tempArray, isSearchObj);
            });

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
                    
                    // 重建数组结构 (防止拖拽后数据错乱)
                    const currentItems = [...container.querySelectorAll('.ost-item-text')];
                    tempArray.length = 0;
                    if (isSearchObj) {
                        currentItems.forEach(el => tempArray.push({ name: el.getAttribute('data-name'), url: el.getAttribute('data-url') }));
                    } else {
                        currentItems.forEach(el => tempArray.push(el.getAttribute('data-url')));
                    }
                };

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', cleanupDrag); handle.addEventListener('pointercancel', cleanupDrag);
            });

            container.appendChild(li);
        });
    }

    function updateAllUI() {
        renderDraggableList('ost-playlist-direct-container', tempPlaylistDirect, false);
        renderDraggableList('ost-playlist-search-container', tempPlaylistSearch, true);
    }
    updateAllUI();

    // =====================
    // 设置面板开关与“放弃修改”逻辑
    // =====================
    const closeSettings = () => {
        // 关闭时直接重置 temp，丢弃未保存的修改
        tempPlaylistDirect = [...playlistDirect];
        tempPlaylistSearch = [...playlistSearch];
        updateAllUI();
        settingsPanel.hide();
    };

    playerContainer.find('#ost-settings-btn').on('click', () => {
        if (settingsPanel.is(':visible')) closeSettings();
        else settingsPanel.show();
    });
    settingsPanel.find('#ost-close-btn').on('click', closeSettings);

    // =====================
    // UI 标签切换与全局排序逻辑
    // =====================
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
        
        const getVal = (item) => typeof item === 'string' ? item : item.name;

        if (type === 'az') targetArray.sort((a,b) => getVal(a).localeCompare(getVal(b)));
        if (type === 'za') targetArray.sort((a,b) => getVal(b).localeCompare(getVal(a)));
        if (type === 'reverse') targetArray.reverse();
        if (type === 'random') targetArray.sort(() => Math.random() - 0.5);
        updateAllUI();
    });

    // =====================
    // 手动直链添加逻辑
    // =====================
    const newLinkInput = settingsPanel.find('#ost-new-link')[0];
    settingsPanel.find('#ost-add-btn').on('click', () => {
        const inputVal = newLinkInput.value.trim();
        if (inputVal) {
            const newLinks = inputVal.split('\n').map(l => l.trim()).filter(l => l !== '');
            tempPlaylistDirect.push(...newLinks);
            newLinkInput.value = '';
            updateAllUI();
        }
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
                searchResults.html('<li style="color:#a1a1aa; padding:8px; font-size:11px; text-align:center;">未找到结果，换个词试试？</li>');
                return;
            }

            songs.forEach(song => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 8px 12px; border-bottom: 1px solid #27272a; color: #e4e4e7; font-size: 11px; cursor: pointer; transition: background 0.2s;";
                li.onmouseenter = () => li.style.background = 'rgba(168, 85, 247, 0.1)';
                li.onmouseleave = () => li.style.background = 'transparent';
                
                const originalText = `${song.name || '未知歌曲'} - ${song.artist || '未知歌手'}`;
                li.innerText = originalText;
                
                li.addEventListener('click', async () => {
                    if (!song.id) { alert('⚠️ 获取歌曲数据异常：缺少ID'); return; }
                    li.innerText = '⏳ 正在解析直链...'; li.style.color = '#fbbf24';

                    try {
                        const urlReq = await fetch(`https://music-api.gdstudio.xyz/api.php?types=url&id=${song.id}&source=${song.source || 'netease'}`);
                        const urlData = await urlReq.json();
                        let finalUrl = urlData.url || (urlData.data && urlData.data.url) || null;

                        if (finalUrl && typeof finalUrl === 'string' && finalUrl.startsWith('http')) {
                            // 关键：将带歌名的对象推入搜索歌单数组
                            tempPlaylistSearch.push({ name: originalText, url: finalUrl });
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
            searchResults.html('<li style="color:#ef4444; padding:8px; font-size:11px; text-align:center;">❌ 搜索失败，请检查网络或 API</li>');
        }
    });

    searchInput.on('keypress', function (e) { if (e.which == 13) searchBtn.click(); });

    // =====================
    // 统一保存并应用逻辑
    // =====================
    settingsPanel.find('#ost-save-btn').off('click').on('click', function() {
        playlistDirect = [...tempPlaylistDirect];
        playlistSearch = [...tempPlaylistSearch];
        activeMode = playerMode; // 当前在哪个面板，就将哪个面板设为激活模式

        localStorage.setItem("ost_custom_playlist", playlistDirect.join('\n'));
        localStorage.setItem("ost_playlist_search", JSON.stringify(playlistSearch));
        localStorage.setItem("ost_active_mode", activeMode);
        
        currentPlaybackList = activeMode === "direct" ? playlistDirect : playlistSearch.map(s => s.url);
        
        if (currentPlaybackList.length > 0) {
            currentIndex = 0;
            localStorage.setItem("ost_current_index", 0);
            audio.src = currentPlaybackList[currentIndex];
            audio.pause(); playBtn.text('▶️');
        } else {
            audio.pause(); audio.src = "";
        }
        
        updateTrackInfo();
        settingsPanel.hide();
        alert(`✅ ${activeMode === 'direct' ? '🔗 直链' : '🌐 搜索'}歌单已保存，并成功应用至播放器！`);
    });
});
