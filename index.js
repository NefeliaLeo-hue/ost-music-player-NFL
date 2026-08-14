console.log("[OST TEST] index.js loaded");

if (typeof jQuery === "undefined") {
    console.error("[OST Player] jQuery missing!");
} else {
    console.log("[OST Player] jQuery OK");
}

jQuery(async function () {
    console.log("[OST Player] INIT START");
    
    // 防止重复加载
    if ($("#ost-player-container").length) {
        console.log("[OST Player] Already loaded");
        return;
    }
    console.log("[OST Player] Initialized");

    // =====================
    // 数据读取
    // =====================
    let savedLinks = localStorage.getItem("ost_custom_playlist");
    let playlist = savedLinks ? savedLinks.split("\n").filter(link => link.trim() !== "") : [];
    let currentIndex = Number(localStorage.getItem("ost_current_index")) || 0;
    
    let audio = new Audio(playlist.length ? playlist[currentIndex] : "");
    
    audio.addEventListener("loadedmetadata", () => {
        console.log("歌曲长度:", audio.duration);
    });
    
    audio.addEventListener("error", () => {
        console.log("[OST Player] 音频错误:", audio.error);
    });
    
    // 音量记忆
    audio.volume = Number(localStorage.getItem("ost_volume")) || 0.5;

    // =====================
    // 恢复播放状态
    // =====================
    let wasPlaying = localStorage.getItem("ost_playing") === "true";
    
    audio.addEventListener("volumechange", () => {
        localStorage.setItem("ost_volume", audio.volume);
    });
    
    // =====================
    // 注入 HTML (主悬浮窗 + 拖拽排序设置面板)
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
            <button class="ost-btn" id="ost-settings-btn">⚙️</button>
            <button class="ost-btn" id="ost-min-btn">🔽</button>
        </div>
    </div>

    <div id="ost-floating-settings" style="display:none; position:fixed; top:80px; right:20px; width:280px; background:rgba(24,24,27,0.95); border:1px solid #3f3f46; border-radius:12px; padding:15px; box-shadow:0 8px 16px rgba(0,0,0,0.8); z-index:999999; backdrop-filter:blur(8px); font-family:system-ui, sans-serif; box-sizing:border-box;">
        <div style="font-size:13px; color:#e4e4e7; font-weight:bold; margin-bottom:12px;">🎵 播放列表设置</div>
        
        <div style="font-size:10px; color:#a1a1aa; margin-bottom:6px;">添加新歌曲 (Catbox 直链)：</div>
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
        
        <button id="ost-save-btn" style="margin-top:15px; width:100%; background:linear-gradient(135deg, #a855f7, #6366f1); border:none; color:white; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">💾 保存并应用歌单</button>
    </div>
    `;
    
    $('body').append(playerHTML);

    const playBtn = $('#ost-play-btn');
    const nextBtn = $('#ost-next-btn');
    const settingsBtn = $('#ost-settings-btn');
    const settingsPanel = $('#ost-floating-settings');
    const saveBtn = $('#ost-save-btn');
    const trackNum = $('#ost-track-num');

    // =====================
    // 拖拽与最小化逻辑 (PC + 移动端全兼容)
    // =====================
    const playerDOM = document.getElementById('ost-player-container');
    let isDragging = false;
    let isMoved = false; 
    let startX, startY, initialX, initialY;

    playerDOM.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;

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

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isMoved = true;
        }

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

    // 缩放点击逻辑
    $('#ost-min-btn').on('click', function(e) {
        e.stopPropagation(); 
        $('#ost-player-container').addClass('minimized');
    });

    $('#ost-player-container').on('click', function(e) {
        if ($(this).hasClass('minimized') && !isMoved) {
            $(this).removeClass('minimized');
        }
    });

    // =====================
    // 播放卡死保护
    // =====================
    let playTimer = null;

    audio.addEventListener("playing", () => {
        clearTimeout(playTimer);
    });
    
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

    // 播放按钮事件
    playBtn.on('click', function() {
        if (playlist.length === 0) {
            alert("请先点击 ⚙️ 齿轮按钮，输入音乐链接！");
            settingsPanel.show();
            return;
        }
        if (audio.paused) {
            audio.play().then(() => {
                localStorage.setItem("ost_playing", "true");
                playBtn.text("⏸️");
            }).catch((err) => {
                console.log("[OST Player] 播放失败:", err);
                playBtn.text("▶️");
            });
        } else {
            audio.pause();
            localStorage.setItem("ost_playing", "false");
            playBtn.text("▶️");
        }
    });

    // 下一曲按钮事件
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

    audio.addEventListener('ended', function() { nextBtn.click(); });

    // 恢复初始播放状态
    if (wasPlaying && playlist.length > 0) {
        audio.play().then(() => {
            playBtn.text("⏸️");
        }).catch(() => {
            console.log("[OST Player] 自动播放被浏览器阻止");
        });
    }

    settingsBtn.on('click', function() {
        settingsPanel.toggle();
    });

    // =====================
    // 歌单列表与拖拽排序逻辑
    // =====================
    const playlistContainer = document.getElementById('ost-playlist-container');
    const newLinkInput = document.getElementById('ost-new-link');
    const addBtn = document.getElementById('ost-add-btn');
    
    let tempPlaylist = [...playlist]; 

                function renderPlaylist() {
        playlistContainer.innerHTML = '';
        
        tempPlaylist.forEach((link, index) => {
            const li = document.createElement('li');
            li.className = 'ost-playlist-item';
            
            // 基础样式：加入 box-sizing 保证边框和内边距无论怎么变，高度都锁死，绝对不发生跳闪抖动
            li.style.cssText = "display: flex; align-items: center; padding: 10px 8px; border-bottom: 1px solid #27272a; background: #18181b; user-select: none; box-sizing: border-box;";
            
            li.innerHTML = `
                <span class="ost-drag-handle" title="按住拖动" style="cursor: grab; padding-right: 12px; color: #52525b; font-size: 14px; touch-action: none;">☰</span>
                <span class="ost-item-text" title="${link}" style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; color: #a1a1aa; font-size: 11px;">${link}</span>
                <span class="ost-delete-btn" title="删除" style="cursor: pointer; color: #ef4444; margin-left: 8px; padding: 2px 6px;">❌</span>
            `;

            // 删除事件
            li.querySelector('.ost-delete-btn').addEventListener('click', () => {
                tempPlaylist.splice(index, 1);
                renderPlaylist();
            });

            // 拖拽核心算法 (克隆跟随 + 占位槽模式)
            const handle = li.querySelector('.ost-drag-handle');
            
            handle.addEventListener('pointerdown', (e) => {
                e.preventDefault(); 
                handle.setPointerCapture(e.pointerId); 
                
                if (navigator.vibrate) navigator.vibrate(50); // 触觉：抓起震动

                // --- 1. 创建悬浮跟随的克隆体 (视觉层) ---
                const rect = li.getBoundingClientRect();
                const clone = li.cloneNode(true); // 完美复刻当前行
                
                // 给克隆体加上绝对悬浮特效（脱离列表，跟随手指，带阴影和高光）
                clone.style.position = 'fixed';
                clone.style.top = rect.top + 'px';
                clone.style.left = rect.left + 'px';
                clone.style.width = rect.width + 'px';
                clone.style.height = rect.height + 'px';
                clone.style.margin = '0';
                clone.style.zIndex = '999999'; // 保证盖住页面所有东西
                clone.style.background = '#27272a';
                clone.style.transform = 'scale(1.02)';
                clone.style.boxShadow = '0 12px 24px rgba(0,0,0,0.8)';
                clone.style.border = '1px solid #a855f7'; 
                clone.style.borderRadius = '6px';
                clone.style.opacity = '0.98';
                clone.style.pointerEvents = 'none'; // 关键：让鼠标/手指穿透克隆体，保证底层列表能收到移动信号
                
                document.body.appendChild(clone); // 扔到页面最顶层

                // 计算手指按下的位置距离元素边缘的偏差，保证拖拽瞬间克隆体不会产生瞬移
                const offsetY = e.clientY - rect.top;
                const offsetX = e.clientX - rect.left;

                // --- 2. 原元素变异为“放置槽” (逻辑层) ---
                const originalOpacities = [];
                [...li.children].forEach(child => {
                    originalOpacities.push(child.style.opacity);
                    child.style.opacity = '0'; // 隐身里面的文字和按钮
                });
                // 背景变成淡淡的紫色，提示用户“松手就会掉进这里”
                li.style.background = 'rgba(168, 85, 247, 0.1)'; 
                li.classList.add('dragging-placeholder');

                // --- 3. 拖拽移动过程 ---
                const onPointerMove = (moveEvent) => {
                    // 让克隆体在 X 和 Y 轴上完美黏住手指
                    clone.style.top = (moveEvent.clientY - offsetY) + 'px';
                    clone.style.left = (moveEvent.clientX - offsetX) + 'px';

                    // 扫描手指当前的 Y 轴坐标，判断它越过了哪一行的中线
                    const siblings = [...playlistContainer.querySelectorAll('.ost-playlist-item:not(.dragging-placeholder)')];
                    
                    let nextSibling = siblings.find(sibling => {
                        const sRect = sibling.getBoundingClientRect();
                        return moveEvent.clientY < sRect.top + sRect.height / 2;
                    });

                    // 移动底层的放置槽，其他列表行会自动被挤开
                    if (nextSibling !== li.nextElementSibling) {
                        playlistContainer.insertBefore(li, nextSibling);
                    }
                };

                // --- 4. 松手释放 ---
                const onPointerUp = (upEvent) => {
                    handle.releasePointerCapture(upEvent.pointerId);
                    
                    if (navigator.vibrate) navigator.vibrate(30); // 触觉：放下震动

                    // 销毁空中的替身
                    clone.remove();

                    // 放置槽还原为真实模样
                    [...li.children].forEach((child, i) => {
                        child.style.opacity = originalOpacities[i] || '1';
                    });
                    li.style.background = '#18181b';
                    li.classList.remove('dragging-placeholder');
                    
                    // 卸载临时监听器，避免内存泄漏
                    handle.removeEventListener('pointermove', onPointerMove);
                    handle.removeEventListener('pointerup', onPointerUp);
                    handle.removeEventListener('pointercancel', onPointerUp);
                    
                    // 重新扫描 DOM 并保存最终顺序
                    const currentItems = [...playlistContainer.querySelectorAll('.ost-item-text')];
                    tempPlaylist = currentItems.map(item => item.getAttribute('title'));
                };

                handle.addEventListener('pointermove', onPointerMove);
                handle.addEventListener('pointerup', onPointerUp);
                handle.addEventListener('pointercancel', onPointerUp);
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

    document.querySelectorAll('.ost-sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.sort;
            if (type === 'az') tempPlaylist.sort();
            if (type === 'za') tempPlaylist.sort().reverse();
            if (type === 'reverse') tempPlaylist.reverse();
            if (type === 'random') tempPlaylist.sort(() => Math.random() - 0.5);
            renderPlaylist();
        });
    });

    saveBtn.on('click', function() {
        playlist = [...tempPlaylist];
        localStorage.setItem('ost_custom_playlist', playlist.join('\n'));
        
        if (playlist.length > 0) {
            currentIndex = 0;
            localStorage.setItem("ost_current_index", 0);
            audio.src = playlist[currentIndex];
            audio.pause();
            playBtn.text('▶️');
            updateTrackInfo();
            settingsPanel.hide();
            alert("✅ 歌单保存成功！");
        } else {
            audio.pause();
            audio.src = "";
            updateTrackInfo();
            settingsPanel.hide();
        }
    });

    renderPlaylist();
});
