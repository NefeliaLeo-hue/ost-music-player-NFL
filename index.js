console.log("[OST TEST] index.js loaded");

if (typeof jQuery === "undefined") {
    console.error("[OST Player] jQuery missing!");
}
else {console.log("[OST Player] jQuery OK");
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

    let savedLinks =
        localStorage.getItem(
            "ost_custom_playlist"
        );
    let playlist =
        savedLinks
        ?
        savedLinks
        .split("\n")
        .filter(
            link => link.trim() !== ""
        )
        :
        [];
    let currentIndex =
        Number(
            localStorage.getItem(
                "ost_current_index"
            )
        )
        ||
        0;
    let audio =
        new Audio(
            playlist.length
            ?
            playlist[currentIndex]
            :
            ""
        );
    audio.addEventListener(
    "loadedmetadata",
    ()=>{
        console.log(
            "歌曲长度:",
            audio.duration
        );
    }
);
    audio.addEventListener(
    "error",
    ()=>{
        console.log(
            "[OST Player] 音频错误:",
            audio.error
        );
    }
);
    
    // 音量记忆

    audio.volume =
        Number(
            localStorage.getItem(
                "ost_volume"
            )
        )
        ||
        0.5;

    // =====================
    // 恢复播放状态
    // =====================

    let wasPlaying =
        localStorage.getItem(
            "ost_playing"
        )
        ===
        "true";
    audio.addEventListener(
    "volumechange",
    ()=>{
        localStorage.setItem(
            "ost_volume",
            audio.volume
        );
    }
);
    
    // 直接在悬浮窗上加回 ⚙️ 齿轮按钮，并附带完全独立的悬浮设置面板
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

    <div id="ost-floating-settings" style="display:none; position:fixed; top:130px; right:20px; width:260px; background:rgba(24,24,27,0.95); border:1px solid #3f3f46; border-radius:12px; padding:12px; box-shadow:0 8px 16px rgba(0,0,0,0.8); z-index:999999; backdrop-filter:blur(8px); font-family:system-ui, sans-serif; box-sizing:border-box;">
        <div style="font-size:12px; color:#e4e4e7; font-weight:bold; margin-bottom:8px;">🎵 OST 播放器</div>
        <div style="font-size:10px; color:#a1a1aa; margin-bottom:8px;">在此粘贴 Catbox 直链 (一行一首)：</div>
        <textarea id="ost-links-input" style="width:100%; height:120px; background:#18181b; color:#a1a1aa; border:1px solid #3f3f46; border-radius:6px; padding:8px; font-size:10px; box-sizing:border-box; white-space:pre; outline:none;"></textarea>
        <button id="ost-save-btn" style="margin-top:10px; width:100%; background:linear-gradient(135deg, #a855f7, #6366f1); border:none; color:white; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold;">保存并应用</button>
    </div>
    `;
    
    $('body').append(playerHTML);

    const playBtn = $('#ost-play-btn');
    const nextBtn = $('#ost-next-btn');
    const settingsBtn = $('#ost-settings-btn');
    const settingsPanel = $('#ost-floating-settings');
    const linksInput = $('#ost-links-input');
    const saveBtn = $('#ost-save-btn');
    const trackNum = $('#ost-track-num');
    

        // =====================
    // 拖拽与最小化逻辑 (PC + 移动端全兼容版)
    // =====================
    
    const playerDOM = document.getElementById('ost-player-container');
    let isDragging = false;
    let isMoved = false; 
    let startX, startY, initialX, initialY;

    // 1. 按下/触摸屏幕：准备拖拽 (用 pointerdown 代替 mousedown)
    playerDOM.addEventListener('pointerdown', (e) => {
        // 如果点的是按钮，不触发拖拽
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
        
        // 【关键】锁定指针：即使手指滑出元素范围，依然能捕捉到滑动事件
        playerDOM.setPointerCapture(e.pointerId);
    });

    // 2. 移动/滑动手指：执行拖拽 (用 pointermove 代替 mousemove)
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

    // 3. 结束拖拽逻辑
    const endDrag = (e) => {
        if (isDragging) {
            isDragging = false;
            playerDOM.style.transition = '';
            // 释放指针锁定
            playerDOM.releasePointerCapture(e.pointerId);
        }
    };

    // 鼠标松开/手指抬起/系统打断 (用 pointerup 和 pointercancel)
    playerDOM.addEventListener('pointerup', endDrag);
    playerDOM.addEventListener('pointercancel', endDrag);

// =====================
    // 缩放点击逻辑 (保持不变)
    // =====================
    
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

audio.addEventListener(
    "playing",
    ()=>{
        clearTimeout(playTimer);
    }
);
audio.addEventListener(
    "waiting",
    ()=>{
        clearTimeout(playTimer);

        playTimer = setTimeout(()=>{
            console.log(
                "[OST Player] 音乐加载超时，自动跳过"
            );
            nextBtn.click();
        },20000);
    }
);
    

    if (savedLinks) { linksInput.val(savedLinks); }

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
            alert("请先点击 ⚙️ 齿轮按钮，输入音乐链接！");
            settingsPanel.show();
            return;
        }
        if (audio.paused) {
    audio.play()
    .then(()=>{
        localStorage.setItem(
            "ost_playing",
            "true"
        );
        playBtn.text("⏸️");
    })
    .catch((err)=>{
        console.log(
            "[OST Player] 播放失败:",
            err
        );
        playBtn.text("▶️");
        
    });

} else {

    audio.pause();
    localStorage.setItem(
        "ost_playing",
        "false"
    );
    playBtn.text("▶️");
        }
    });

    nextBtn.on('click', function() {
        if (playlist.length === 0) return;
        audio.pause();
        currentIndex = (currentIndex + 1) % playlist.length;
        
        localStorage.setItem(
    "ost_current_index",
    currentIndex
);
        audio.src = playlist[currentIndex];
        audio.play();
        playBtn.text('⏸️');
        updateTrackInfo();
    });

    audio.addEventListener('ended', function() { nextBtn.click(); });

    // 恢复播放

if(wasPlaying
    &&
    playlist.length > 0
){audio.play()
    .then(()=>{
        playBtn.text("⏸️");
    })
    .catch(()=>{
        console.log(
        "[OST Player] 自动播放被浏览器阻止"
        );
    });
}

    settingsBtn.on('click', function() {
        settingsPanel.toggle();
    });

    saveBtn.on('click', function() {
        const newLinks = linksInput.val();
        localStorage.setItem('ost_custom_playlist', newLinks);
        playlist = newLinks.split('\n').filter(link => link.trim() !== '');
        
        if (playlist.length > 0) {
            currentIndex = 0;

            localStorage.setItem(
    "ost_current_index",
    0
);
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
});
