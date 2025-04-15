// 遊戲配置
const config = {
    initialZoom: 1,
    minZoom: 0.1,
    maxZoom: 50,
    targetRadius: 2,
    trailOpacity: 0.8,
    zoomSpeed: 0.1
};

// 遊戲狀態
const gameState = {
    isInitialized: false,
    isLoading: true,
    error: null
};


class MazeGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.initializeCanvas();
        // 添加觸控相關狀態
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTouchDistance = 0;
        this.isTouching = false;
        this.isMultiTouch = false;
        
        // 初始化移動端視圖
        this.initMobileView();
        // 遊戲狀態
        this.zoomFactor = config.initialZoom;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        // 原有的建構函式內容
        // 加入新的變數追蹤上一個有效的滑鼠位置
        this.lastValidMouseX = null;
        this.lastValidMouseY = null;
        // 添加邊界檢測的邊距
        this.boundaryMargin = 10; // 距離邊緣多少像素時觸發
        // 修改終點屬性，加入原始座標
       this.endpoint = {
            originalX: 1852,
            originalY: 798,
            radius: 30,
            x: 1852,  // 這將被動態更新
            y: 798,  // 這將被動態更新
        };
        this.hasReachedEnd = false;
        this.fadeAlpha = 0;
        this.congratsAlpha = 0;
        this.isTransitioning = false;
        this.congratsTimeout = null;
        this.coloredImage = new Image();
        this.coloredImage.src = './images/星鳴特攻.png';
        // 綁定觸控事件
        this.bindTouchEvents();
        this.showRulesModal();
        
        // 目標物件
        this.target = {
            x: 440,
            y: 268,
            radius: config.targetRadius,
            color: 'red',
            borderColor: 'blue',
            following: false,
            trail: []
        };

        // 添加搖桿狀態
        this.joystickSpeed = 5; // 調整移動速度
        this.bindJoystickEvents();

        
        // 添加描述面板的引用
        this.descriptionPanel = document.getElementById('descriptionPanel');
        if (!this.descriptionPanel) {
            this.createDescriptionPanel();
        }
        
        this.bindEvents();
        this.loadMazeImage();

        function checkBoundaryAndCenter() {
            // 獲取畫布可視區域的尺寸
            const viewportWidth = this.canvas.width;
            const viewportHeight = this.canvas.height;
            
            // 計算目標相對於畫布邊緣的距離百分比
            const leftDistance = this.target.x;
            const rightDistance = viewportWidth - this.target.x;
            const topDistance = this.target.y;
            const bottomDistance = viewportHeight - this.target.y;
            
            // 設定邊界閾值（接近邊緣多少開始移動畫面）
            const boundaryThreshold = viewportWidth * 0.2; // 視窗寬度的20%
            
            // 檢查是否接近邊界並計算需要移動的距離
            let moveX = 0;
            let moveY = 0;
            
            if (leftDistance < boundaryThreshold) {
                // 計算需要向右移動的距離，越接近邊緣移動越多
                const ratio = 1 - (leftDistance / boundaryThreshold);
                moveX = boundaryThreshold * ratio * 0.1; // 緩慢移動
            } else if (rightDistance < boundaryThreshold) {
                // 計算需要向左移動的距離
                const ratio = 1 - (rightDistance / boundaryThreshold);
                moveX = -boundaryThreshold * ratio * 0.1;
            }
            
            if (topDistance < boundaryThreshold) {
                // 計算需要向下移動的距離
                const ratio = 1 - (topDistance / boundaryThreshold);
                moveY = boundaryThreshold * ratio * 0.1;
            } else if (bottomDistance < boundaryThreshold) {
                // 計算需要向上移動的距離
                const ratio = 1 - (bottomDistance / boundaryThreshold);
                moveY = -boundaryThreshold * ratio * 0.1;
            }
            
            // 如果需要移動，調整偏移量同時保持目標與畫面的相對位置
            if (moveX !== 0 || moveY !== 0) {
                // 移動畫面偏移
                this.offsetX += moveX;
                this.offsetY += moveY;
                
                // 同時移動目標位置保持相對位置不變
                this.target.x += moveX;
                this.target.y += moveY;
                
                // 更新目標軌跡
                this.target.trail = this.target.trail.map(point => ({
                    x: point.x + moveX,
                    y: point.y + moveY
                }));
                
                // 更新終點位置
                this.endpoint.x += moveX;
                this.endpoint.y += moveY;
                
                return true; // 返回true表示進行了邊界調整
            }
            
            return false; // 返回false表示沒有進行邊界調整
        }
        
        // 2. 新增WASD鍵盤控制畫面移動功能
        function initKeyboardControls() {
            // 移動速度
            const moveSpeed = 20; // 畫面移動速度
            const targetSpeed = 8; // 目標移動速度
            
            // 按鍵狀態
            const keyState = {
                // WASD - 目標移動
                w: false,
                a: false,
                s: false,
                d: false,
                // 方向鍵 - 畫面移動
                ArrowUp: false,
                ArrowDown: false,
                ArrowLeft: false,
                ArrowRight: false
            };
            
            // 監聽按鍵按下事件
            window.addEventListener('keydown', (event) => {
                const key = event.key;
                if (key in keyState) {
                    keyState[key] = true;
                    // 防止方向鍵滾動頁面
                    if (key.startsWith('Arrow')) {
                        event.preventDefault();
                    }
                }
            });
            
            // 監聽按鍵釋放事件
            window.addEventListener('keyup', (event) => {
                const key = event.key;
                if (key in keyState) {
                    keyState[key] = false;
                }
            });
            
            // 設定定時移動功能
            const moveInterval = setInterval(() => {
                // 1. 畫面移動 (方向鍵)
                let moveX = 0;
                let moveY = 0;
                
                // 根據方向鍵狀態計算畫面移動方向
                if (keyState.ArrowUp) moveY += moveSpeed;
                if (keyState.ArrowDown) moveY -= moveSpeed;
                if (keyState.ArrowLeft) moveX += moveSpeed;
                if (keyState.ArrowRight) moveX -= moveSpeed;
                
                // 如果有畫面移動，進行畫面調整
                if (moveX !== 0 || moveY !== 0) {
                    // 更新偏移量
                    this.offsetX += moveX;
                    this.offsetY += moveY;
                    
                    // 同時移動目標和相關元素以保持相對位置
                    this.target.x += moveX;
                    this.target.y += moveY;
                    
                    // 更新目標軌跡
                    this.target.trail = this.target.trail.map(point => ({
                        x: point.x + moveX,
                        y: point.y + moveY
                    }));
                    
                    // 更新終點位置
                    this.endpoint.x += moveX;
                    this.endpoint.y += moveY;
                }
                
                // 2. 目標移動 (WASD)
                if (this.hasReachedEnd) return; // 如果已到達終點，不移動目標
                
                let targetMoveX = 0;
                let targetMoveY = 0;
                
                // 根據WASD按鍵狀態計算目標移動方向
                if (keyState.w) targetMoveY -= targetSpeed;
                if (keyState.s) targetMoveY += targetSpeed;
                if (keyState.a) targetMoveX -= targetSpeed;
                if (keyState.d) targetMoveX += targetSpeed;
                
                // 如果有目標移動
                if (targetMoveX !== 0 || targetMoveY !== 0) {
                    // 計算新位置
                    const targetX = this.target.x + targetMoveX;
                    const targetY = this.target.y + targetMoveY;
                    
                    // 如果目標不在跟隨狀態，激活跟隨狀態
                    if (!this.target.following) {
                        this.target.following = true;
                        this.target.color = 'blue';
                        this.target.trail = [{ x: this.target.x, y: this.target.y }];
                    }
                    
                    // 使用滑動邏輯找出最佳移動位置（避開障礙物）
                    const newPosition = this.findSlidingPosition(
                        this.target.x,
                        this.target.y,
                        targetX,
                        targetY
                    );
                    
                    // 更新目標位置
                    this.target.x = newPosition.x;
                    this.target.y = newPosition.y;
                    
                    // 添加軌跡點
                    this.target.trail.push({
                        x: this.target.x,
                        y: this.target.y
                    });
                    
                    // 限制軌跡長度
                    if (this.target.trail.length > 1000000) {
                        this.target.trail.shift();
                    }
                    
                    // 檢查終點
                    this.checkEndpoint();
                } else if (this.target.following) {
                    
                    this.target.color = 'red';
                   
                }
            }, 30); // 約30fps的更新頻率
            
            // 將清除功能添加到遊戲實例中，以便在需要時清除
            this.clearKeyboardControls = () => {
                clearInterval(moveInterval);
            };
        }
        
        // 3. 整合到MazeGame類的constructor中
        // 在你的constructor函式結尾前加入：
        this.checkBoundaryAndCenter = checkBoundaryAndCenter.bind(this);
        this.initKeyboardControls = initKeyboardControls.bind(this);
        this.initKeyboardControls(); // 初始化鍵盤控制
        
        // 4. 在update或游戲循環中調用邊界檢查（假設你有一個update方法）
        // 如果沒有update方法，則需要加入一個：
        function update() {
            // 只在移動端或觸控設備上檢查邊界
            if ('ontouchstart' in window && this.target.following) {
                this.checkBoundaryAndCenter();
            }
            
            // 在此處添加其他更新邏輯...
            
            // 重繪遊戲界面
            this.render();
            
            // 請求下一幀更新
            requestAnimationFrame(this.update.bind(this));
        }
        
        // 5. 在constructor中初始化update循環
        this.update = update.bind(this);
        requestAnimationFrame(this.update.bind(this));
    }

    showRulesModal() {
        const modal = document.getElementById('rules-modal');
        const closeButton = document.getElementById('close-rules-modal');
        
        modal.style.display = 'flex';
        
        closeButton.onclick = () => {
            modal.style.display = 'none';
        };
    }

    initMobileView() {
        // 設置viewport
        const viewport = document.querySelector('meta[name=viewport]');
        if (!viewport) {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(meta);
        }

        // 調整畫布大小以適應螢幕
        const updateCanvasSize = () => {
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const screenRatio = screenWidth / screenHeight;
            
            // 保持畫布的原始比例
            const originalRatio = 1980 / 1080; // 原始寬高比
            
            let canvasWidth, canvasHeight;
            if (screenRatio > originalRatio) {
                // 螢幕較寬，以高度為準
                canvasHeight = screenHeight;
                canvasWidth = screenHeight * originalRatio;
            } else {
                // 螢幕較窄，以寬度為準
                canvasWidth = screenWidth;
                canvasHeight = screenWidth / originalRatio;
            }
            
            this.canvas.style.width = `${canvasWidth}px`;
            this.canvas.style.height = `${canvasHeight}px`;
            
            // 保持畫布的實際像素大小
            this.canvas.width = 1980;
            this.canvas.height = 1080;
        };

        // 初始調整大小
        updateCanvasSize();
        
        // 監聽螢幕方向變化
        window.addEventListener('resize', updateCanvasSize);
        window.addEventListener('orientationchange', updateCanvasSize);
    }

    bindTouchEvents() {
        
        // 觸控開始
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            // 處理點擊建築物
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const canvasScaleX = this.canvas.width / rect.width;
            const canvasScaleY = this.canvas.height / rect.height;
            
            const touchX = (touch.clientX - rect.left) * canvasScaleX;
            const touchY = (touch.clientY - rect.top) * canvasScaleY;

            // 檢查所有位置組
            [this.locations1, this.locations2, this.locations3, this.locations4, this.locations5].forEach(locations => {
                locations.forEach(loc => {
                    const scaledX = loc.x * this.zoomFactor + this.offsetX;
                    const scaledY = loc.y * this.zoomFactor + this.offsetY;
                    const scaledWidth = loc.width * this.zoomFactor;
                    const scaledHeight = loc.height * this.zoomFactor;

                    if (
                        touchX >= scaledX &&
                        touchX <= scaledX + scaledWidth &&
                        touchY >= scaledY &&
                        touchY <= scaledY + scaledHeight
                    ) {
                        this.showDescription(loc.text, loc.description);
                    }
                });
            });
            this.isTouching = true;
            
            if (e.touches.length === 2) {
                // 兩指觸控，準備縮放
                this.isMultiTouch = true;
                this.lastTouchDistance = this.getTouchDistance(e.touches);
            } else if (e.touches.length === 1) {
                // 單指觸控
                const touch = e.touches[0];
                this.touchStartX = touch.clientX;
                this.touchStartY = touch.clientY;
                
                // 檢查是否點擊到目標
                this.handleTouchStart(touch);
            }
        });

        // 觸控移動
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            
            if (!this.isTouching) return;

            if (this.isMultiTouch && e.touches.length === 2) {
                // 處理縮放
                this.handlePinchZoom(e.touches);
            } else if (e.touches.length === 1) {
                // 處理拖曳
                this.handleTouchMove(e.touches[0]);
            }
        });

        // 觸控結束
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            if (e.touches.length === 0) {
                this.isTouching = false;
                this.isMultiTouch = false;
                // 處理觸控結束
                this.handleTouchEnd(e);
            } else if (e.touches.length === 1) {
                this.isMultiTouch = false;
                // 更新單指觸控的起始位置
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
            }
        });
    }

    // 計算兩指間距離
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    handleTouchStart(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;
        
        const touchX = (touch.clientX - rect.left) * canvasScaleX;
        const touchY = (touch.clientY - rect.top) * canvasScaleY;
    
        // 檢查建築物點擊
        [this.locations1, this.locations2, this.locations3, this.locations4, this.locations5].forEach(locations => {
            locations.forEach(loc => {
                const scaledX = loc.x * this.zoomFactor + this.offsetX;
                const scaledY = loc.y * this.zoomFactor + this.offsetY;
                const scaledWidth = loc.width * this.zoomFactor;
                const scaledHeight = loc.height * this.zoomFactor;
    
                if (
                    touchX >= scaledX &&
                    touchX <= scaledX + scaledWidth &&
                    touchY >= scaledY &&
                    touchY <= scaledY + scaledHeight
                ) {
                    this.showDescription(loc.text, loc.description);
                }
            });
        });
    }

    handleTouchMove(touch) { 
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;
    
        const touchX = (touch.clientX - rect.left) * canvasScaleX;
        const touchY = (touch.clientY - rect.top) * canvasScaleY;
    
        // 計算移動距離
        const prevX = (this.touchStartX - rect.left) * canvasScaleX;
        const prevY = (this.touchStartY - rect.top) * canvasScaleY;
        const dx = touchX - prevX;
        const dy = touchY - prevY;
    
        // 更新偏移
        this.offsetX += dx;
        this.offsetY += dy;
    
        // 更新目標位置
        this.target.x += dx;
        this.target.y += dy;
    
        // 更新目標軌跡
        this.target.trail = this.target.trail.map(point => ({
            x: point.x + dx,
            y: point.y + dy
        }));
    
        // 更新終點位置
        this.endpoint.x += dx;
        this.endpoint.y += dy;
    
        // 更新觸控起始位置
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
    }

    // 修改處理雙指縮放的方法
handlePinchZoom(touches) {
    const currentDistance = this.getTouchDistance(touches);
    const scale = currentDistance / this.lastTouchDistance;
    
    // 計算縮放中心點
    const rect = this.canvas.getBoundingClientRect();
    const canvasScaleX = this.canvas.width / rect.width;
    const canvasScaleY = this.canvas.height / rect.height;
    
    const touch1X = (touches[0].clientX - rect.left) * canvasScaleX;
    const touch1Y = (touches[0].clientY - rect.top) * canvasScaleY;
    const touch2X = (touches[1].clientX - rect.left) * canvasScaleX;
    const touch2Y = (touches[1].clientY - rect.top) * canvasScaleY;
    
    const centerX = (touch1X + touch2X) / 2;
    const centerY = (touch1Y + touch2Y) / 2;
    
    // 檢查新的縮放是否在允許範圍內
    const newZoom = this.zoomFactor * scale;
    if (newZoom >= config.minZoom && newZoom <= config.maxZoom) {
        // 保存當前目標相對於縮放中心的位置
        const targetRelX = this.target.x - centerX;
        const targetRelY = this.target.y - centerY;
        
        this.zoomFactor = newZoom;
        
        // 更新偏移以保持縮放中心點
        this.offsetX = centerX - (centerX - this.offsetX) * scale;
        this.offsetY = centerY - (centerY - this.offsetY) * scale;
        
        // 更新目標位置
        this.target.x = centerX + targetRelX * scale;
        this.target.y = centerY + targetRelY * scale;
        
        // 更新目標軌跡
        this.target.trail = this.target.trail.map(point => ({
            x: centerX + (point.x - centerX) * scale,
            y: centerY + (point.y - centerY) * scale
        }));
        
        // 更新終點位置
        this.updateEndpointPosition();
    }
    
    this.lastTouchDistance = currentDistance;
}

    

initializeCanvas() {
    // 設定固定的畫布大小
    const CANVAS_WIDTH = 1980;  // 或其他你想要的固定寬度
    const CANVAS_HEIGHT = 1080; // 或其他你想要的固定高度
    
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    
    // 使用 CSS 來控制顯示大小，保持長寬比
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.canvas.style.maxWidth = '100%';
    this.canvas.style.objectFit = 'contain';
    
    // 防止畫布被壓縮
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.imageRendering = '-moz-crisp-edges';
    this.canvas.style.imageRendering = 'crisp-edges';
}

    // 判斷特定座標是否為障礙物
    isPointObstacle(x, y) {
        if (!this.collisionMap) {
            console.error("碰撞地圖未生成！");
            return false;
        }

        // 將螢幕座標轉換為原始圖像座標
        const adjustedX = Math.round((x - this.offsetX) / this.zoomFactor);
        const adjustedY = Math.round((y - this.offsetY) / this.zoomFactor);

        // 確保不超出地圖邊界
        if (
            adjustedX >= 0 && adjustedX < this.collisionMap[0].length &&
            adjustedY >= 0 && adjustedY < this.collisionMap.length
        ) {
            return this.collisionMap[adjustedY][adjustedX] === 1;
        }

        // 如果超出邊界，視為障礙物
        return true;
    }

    // 尋找可行的滑動方向
    findSlidingPosition(currentX, currentY, targetX, targetY) {
        // 如果可以直接移動，則返回目標位置
        if (!this.isLineCollidingWithObstacle(currentX, currentY, targetX, targetY)) {
            return { x: targetX, y: targetY };
        }
    
        // 計算移動向量
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        
        // 嘗試水平移動
        if (Math.abs(dx) > 0.1 && !this.isLineCollidingWithObstacle(currentX, currentY, targetX, currentY)) {
            return { x: targetX, y: currentY };
        }
    
        // 嘗試垂直移動
        if (Math.abs(dy) > 0.1 && !this.isLineCollidingWithObstacle(currentX, currentY, currentX, targetY)) {
            return { x: currentX, y: targetY };
        }
        
        // 如果主要方向都不行，嘗試對角線滑動
        // 這里我們將依次嘗試8個方向，優先嘗試接近目標方向的移動
        
        // 計算八個方向的單位向量
        const directions = [
            { x: 1, y: 0 },   // 右
            { x: 1, y: 1 },   // 右下
            { x: 0, y: 1 },   // 下
            { x: -1, y: 1 },  // 左下
            { x: -1, y: 0 },  // 左
            { x: -1, y: -1 }, // 左上
            { x: 0, y: -1 },  // 上
            { x: 1, y: -1 }   // 右上
        ];
        
        // 計算出原始方向與目標的夾角
        const targetAngle = Math.atan2(dy, dx);
        
        // 計算每個方向的角度
        const directionAngles = directions.map((dir, index) => {
            const angle = Math.atan2(dir.y, dir.x);
            // 計算與目標方向的角度差（考慮循環）
            let angleDiff = Math.abs(angle - targetAngle);
            if (angleDiff > Math.PI) {
                angleDiff = 2 * Math.PI - angleDiff;
            }
            return { index, angleDiff };
        });
        
        // 按角度差排序，優先嘗試接近原始方向的移動
        directionAngles.sort((a, b) => a.angleDiff - b.angleDiff);
        
        // 按角度差從小到大嘗試每個方向
        for (const { index } of directionAngles) {
            const dir = directions[index];
            const moveDistance = this.joystickSpeed;
            const newX = currentX + dir.x * moveDistance;
            const newY = currentY + dir.y * moveDistance;
            
            if (!this.isLineCollidingWithObstacle(currentX, currentY, newX, newY)) {
                return { x: newX, y: newY };
            }
        }
        
        // 如果八個方向都不行，再嘗試更小步長的移動
        // 這有助於在狹窄通道中移動
        const halfSpeed = this.joystickSpeed / 2;
        for (const { index } of directionAngles) {
            const dir = directions[index];
            const newX = currentX + dir.x * halfSpeed;
            const newY = currentY + dir.y * halfSpeed;
            
            if (!this.isLineCollidingWithObstacle(currentX, currentY, newX, newY)) {
                return { x: newX, y: newY };
            }
        }
        
        // 如果所有方向都無法移動，則保持原位
        return { x: currentX, y: currentY };
    }

    bindJoystickEvents() {
        let isMoving = false;
        let moveDirection = { x: 0, y: 0 };
        let animationFrameId = null; // 追蹤動畫幀ID
    
        const moveTarget = () => {
            if (!isMoving) {
                // 如果不再移動，取消動畫循環
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                return;
            }
    
            // 計算目標位置 - 確保速度一致
            const speedFactor = this.joystickSpeed;
            const targetX = this.target.x + moveDirection.x * speedFactor;
            const targetY = this.target.y + moveDirection.y * speedFactor;
    
            // 使用滑動邏輯找出最佳移動位置
            const newPosition = this.findSlidingPosition(
                this.target.x,
                this.target.y,
                targetX,
                targetY
            );
    
            // 更新位置
            this.target.x = newPosition.x;
            this.target.y = newPosition.y;
    
            // 添加軌跡點
            this.target.trail.push({
                x: this.target.x,
                y: this.target.y
            });
    
            // 限制軌跡長度
            if (this.target.trail.length > 1000000) {
                this.target.trail.shift();
            }
    
            // 檢查終點
            this.checkEndpoint();
    
            // 繼續動畫循環，確保只有一個循環在運行
            animationFrameId = requestAnimationFrame(moveTarget);
        };
    
        // 監聽 joystickMove 事件
        window.addEventListener('joystickMove', (e) => {
            if (this.hasReachedEnd) return;
    
            // 修改目標顏色和跟隨狀態
            this.target.color = 'blue';
            this.target.following = true;
    
            // 更新移動方向 - 確保方向向量的長度始終為1或更小
            const { x, y } = e.detail;
            const magnitude = Math.sqrt(x * x + y * y);
            
            // 規範化向量，確保magnitude不超過1
            if (magnitude > 1) {
                moveDirection.x = x / magnitude;
                moveDirection.y = y / magnitude;
            } else {
                moveDirection.x = x;
                moveDirection.y = y;
            }
    
            // 啟動動畫循環，確保只有一個循環在運行
            if (!isMoving) {
                isMoving = true;
                // 取消之前的動畫循環（如果有）
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                animationFrameId = requestAnimationFrame(moveTarget);
            }
        });
    
        // 監聽 joystickEnd 事件
        window.addEventListener('joystickEnd', () => {
            // 停止移動
            isMoving = false;
            
            // 重置移動方向
            moveDirection.x = 0;
            moveDirection.y = 0;
            
            // 取消動畫循環
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            this.target.following = false;
            this.target.color = 'red';
        });
    }
    
    loadMazeImage() {
        this.mazeImage = new Image();
        this.mazeImage.onload = () => {
            // 初始化遊戲狀態
            gameState.isLoading = false;
            gameState.isInitialized = true;
    
            // 繪製迷宮圖像
            this.ctx.drawImage(this.mazeImage, 0, 0, this.canvas.width, this.canvas.height);
    
            // 生成碰撞地圖 (假設已有 generateCollisionMap 方法)
            this.generateCollisionMap();
    
            // 可視化碰撞地圖
            this.visualizeCollisionMap();
    
            // 開始遊戲循環
            this.startGameLoop();
        };
        this.mazeImage.onerror = (error) => {
            gameState.error = '迷宮圖片載入失敗';
            console.error('圖片載入錯誤:', error);
        };
        this.mazeImage.src = './images/星鳴特攻.png';
    }

    generateCollisionMap() {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
    
        // 建立空的二維陣列
        const collisionMap = Array.from({ length: canvasHeight }, () => 
            Array(canvasWidth).fill(0)
        );
    
        // 讀取整個畫布的像素資料
        const imageData = this.ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
    
        for (let y = 0; y < canvasHeight; y++) {
            for (let x = 0; x < canvasWidth; x++) {
                const index = (y * canvasWidth + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];
    
                // 如果是黑色像素（或近似黑色）
                if (r <= 20 && g <= 20 && b <= 20 && a > 0) {
                    collisionMap[y][x] = 1; // 直接標記為障礙物
                }
            }
        }
    
        this.collisionMap = collisionMap;
        console.log("碰撞地圖生成完成！");
    }

    // 修改建立描述面板的方法
createDescriptionPanel() {
    this.descriptionPanel = document.createElement('div');
    this.descriptionPanel.id = 'descriptionPanel';
    this.descriptionPanel.style.cssText = `
        position: fixed;
        right: 20px;
        top: 20px;
        width: 300px;
        max-height: 80vh;
        padding: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        visibility: hidden; /* 使用 visibility 代替 display */
        opacity: 0;
        transition: visibility 0s, opacity 0.3s linear; /* 添加過渡效果 */
    `;

    // 創建關閉按鈕
    const closeButton = document.createElement('div');
    closeButton.style.cssText = `
        position: absolute;
        right: 10px;
        top: 10px;
        width: 20px;
        height: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        line-height: 20px;
        color: #666;
    `;
    closeButton.innerHTML = '×';
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideDescription();
    });

    // 創建內容容器
    this.descriptionContent = document.createElement('div');
    this.descriptionContent.style.cssText = `
        padding-right: 20px;
    `;

    this.descriptionPanel.appendChild(closeButton);
    this.descriptionPanel.appendChild(this.descriptionContent);
    document.body.appendChild(this.descriptionPanel);
}

// 修改顯示描述文字的方法
showDescription(title, description) {
    // 更新內容，將換行符替換為 HTML 的段落標籤
    this.descriptionContent.innerHTML = `
        <h3 style="margin: 0 0 10px 0;">${title}</h3>
        <p style="margin: 0; white-space: pre-line;">${description}</p>
    `;
    
    // 顯示面板
    this.descriptionPanel.style.visibility = 'visible';
    this.descriptionPanel.style.opacity = '1';
}

// 修改隱藏描述面板的方法
hideDescription() {
    this.descriptionPanel.style.opacity = '0';
    setTimeout(() => {
        this.descriptionPanel.style.visibility = 'hidden';
    }, 300); // 等待淡出動畫完成
}

    // 更新終點座標的方法
    updateEndpointPosition() {
        this.endpoint.x = this.endpoint.originalX * this.zoomFactor + this.offsetX;
        this.endpoint.y = this.endpoint.originalY * this.zoomFactor + this.offsetY;
    }

    bindEvents() {
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleMouseClick.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    }

    // 檢查滑鼠是否在有效範圍內
    isMouseInBounds(mouseX, mouseY) {
        const rect = this.canvas.getBoundingClientRect();
        
        // 添加邊距檢查
        return (
            mouseX >= rect.left + this.boundaryMargin &&
            mouseX <= rect.right - this.boundaryMargin &&
            mouseY >= rect.top + this.boundaryMargin &&
            mouseY <= rect.bottom - this.boundaryMargin
        );
    }

    

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;

        // 將初始的 lastValidMouse 座標轉換為畫布內部座標
        this.lastValidMouseX = (event.clientX - rect.left) * canvasScaleX;
        this.lastValidMouseY = (event.clientY - rect.top) * canvasScaleY;
        
        // 計算當前滑鼠在畫布上的位置
        const currentMouseX = (event.clientX - rect.left) * canvasScaleX;
        const currentMouseY = (event.clientY - rect.top) * canvasScaleY;

        console.log(`目標座標: x=${this.target.x}, y=${this.target.y}`);


        // 初始化或更新上一個有效的滑鼠位置
        if (this.lastValidMouseX === null) {
            this.lastValidMouseX = currentMouseX;
            this.lastValidMouseY = currentMouseY;
        }

        if (this.isDragging) {
                const dx = ((event.clientX - this.lastMouseX) * canvasScaleX);
                const dy = ((event.clientY - this.lastMouseY) * canvasScaleY);
    
                this.offsetX += dx;
                this.offsetY += dy;
    
                this.target.x += dx;
                this.target.y += dy;
                this.target.trail = this.target.trail.map(point => ({
                    x: point.x + dx,
                    y: point.y + dy
                }));
                // 更新終點位置
                this.endpoint.x += dx;
                this.endpoint.y += dy;
            
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
        } 

        if (false) {
            function oldFunction() {
        
        if (this.target.following) {
            console.log("檢測碰撞:", {
                lastX: this.lastValidMouseX,
                lastY: this.lastValidMouseY,
                currentX: currentMouseX,
                currentY: currentMouseY
            });

            // 檢查碰撞
            if (this.isLineCollidingWithObstacle(
                this.lastValidMouseX,
                this.lastValidMouseY,
                currentMouseX,
                currentMouseY
            )) {
                console.log("檢測到碰撞!");
            
                if (this.target.trail.length >= 5) {
                    const trailPoints = [];
                    for (let i = 0; i < 5; i++) {
                        trailPoints.push(this.target.trail.pop()); // 移除並保存最後五個點
                    }
                
                    const lastTrailPoint = trailPoints[trailPoints.length - 1];
                    this.target.x = lastTrailPoint.x;
                    this.target.y = lastTrailPoint.y;
                
                    console.log("退回到最近的五個點:", trailPoints);
                }
            
                // 停止跟隨並更改目標顏色
                this.target.following = false;
                this.target.color = 'red';
                return;
            }

            // 更新目標位置
            this.target.x = currentMouseX;
            this.target.y = currentMouseY;
            
            // 添加新的軌跡點
            this.target.trail.push({
                x: this.target.x,
                y: this.target.y
            });

            // 限制軌跡長度
            if (this.target.trail.length > 1000000) {
                this.target.trail.shift();
            }

            // 更新上一個有效的滑鼠位置
            this.lastValidMouseX = currentMouseX;
            this.lastValidMouseY = currentMouseY;
        }
        const result = somethingOld();
        return result;
      }
      
      const oldVariable = {
        property: "value"
      };
    }
    }

    handleMouseDown(event) {
        const { clientX: mouseX, clientY: mouseY } = event;

        if (event.button === 0) { // 左鍵
            this.isDragging = true;
            this.lastMouseX = mouseX;
            this.lastMouseY = mouseY;
        }
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    handleMouseClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;
        
        const adjustedMouseX = (event.clientX - rect.left) * canvasScaleX;
        const adjustedMouseY = (event.clientY - rect.top) * canvasScaleY;
    
        // 創建一個通用函數來檢查是否點擊了地點物件
        const isLocationClicked = (location) => {
            const scaledX = location.x * this.zoomFactor + this.offsetX;
            const scaledY = location.y * this.zoomFactor + this.offsetY;
            const scaledWidth = location.width * this.zoomFactor;
            const scaledHeight = location.height * this.zoomFactor;
    
            return (
                adjustedMouseX >= scaledX &&
                adjustedMouseX <= scaledX + scaledWidth &&
                adjustedMouseY >= scaledY &&
                adjustedMouseY <= scaledY + scaledHeight
            );
        };
    
        // 檢查所有位置組
        const locationGroups = [
            this.locations1,
            this.locations2, 
            this.locations3,
            this.locations4,
            this.locations5
        ];
    
        // 遍歷所有位置組
        for (const locations of locationGroups) {
            const clickedLocation = locations.find(isLocationClicked);
            if (clickedLocation) {
                this.showDescription(clickedLocation.text, clickedLocation.description);
            }
        }
    }

    

    // 更新縮放處理
    handleWheel(event) {
        event.preventDefault();
        
        
        const { clientX: mouseX, clientY: mouseY, deltaY } = event;
        const zoomDirection = deltaY < 0 ? 1 : -1;
        const zoomFactor = 1 + zoomDirection * config.zoomSpeed;
        const newZoom = this.zoomFactor * zoomFactor;

        if (newZoom >= config.minZoom && newZoom <= config.maxZoom) {
            const rect = this.canvas.getBoundingClientRect();
            const mousePos = {
                x: mouseX - this.offsetX,
                y: mouseY - this.offsetY
            };

            this.zoomFactor = newZoom;
            this.offsetX = mouseX - mousePos.x * zoomFactor;
            this.offsetY = mouseY - mousePos.y * zoomFactor;

            // 更新目標位置
            const targetRelativeX = (this.target.x - mouseX) * zoomFactor;
            const targetRelativeY = (this.target.y - mouseY) * zoomFactor;
            this.target.x = mouseX + targetRelativeX;
            this.target.y = mouseY + targetRelativeY;

            // 更新終點位置
            this.updateEndpointPosition();

            // 更新軌跡點
            this.target.trail = this.target.trail.map(point => ({
                x: mouseX + (point.x - mouseX) * zoomFactor,
                y: mouseY + (point.y - mouseY) * zoomFactor
            }));
        }
    }

    isMouseOnTarget(mouseX, mouseY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;
        
        // 轉換滑鼠座標到畫布座標系統
        const adjustedMouseX = (mouseX - rect.left) * canvasScaleX;
        const adjustedMouseY = (mouseY - rect.top) * canvasScaleY;
        
        // 計算距離，考慮縮放和偏移
        const dist = Math.sqrt(
            (adjustedMouseX - this.target.x) ** 2 + 
            (adjustedMouseY - this.target.y) ** 2
        );
        
        return dist < (this.target.radius * this.zoomFactor * 2);
    }

    isLineCollidingWithObstacle(x1, y1, x2, y2) {
        if (!this.collisionMap) {
            console.error("碰撞地圖未生成！");
            return false;
        }
    
        // 將螢幕座標轉換為原始圖像座標
        const adjustedX1 = Math.round((x1 - this.offsetX) / this.zoomFactor);
        const adjustedY1 = Math.round((y1 - this.offsetY) / this.zoomFactor);
        const adjustedX2 = Math.round((x2 - this.offsetX) / this.zoomFactor);
        const adjustedY2 = Math.round((y2 - this.offsetY) / this.zoomFactor);
    
        const distance = Math.sqrt((adjustedX2 - adjustedX1) ** 2 + (adjustedY2 - adjustedY1) ** 2);
        const steps = Math.max(Math.ceil(distance), 10);
    
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.round(adjustedX1 + (adjustedX2 - adjustedX1) * t);
            const y = Math.round(adjustedY1 + (adjustedY2 - adjustedY1) * t);
    
            // 確保不超出地圖邊界
            if (
                x >= 0 && x < this.collisionMap[0].length &&
                y >= 0 && y < this.collisionMap.length
            ) {
                if (this.collisionMap[y][x] === 1) {
                    console.log("碰撞發生於點:", { x, y });
                    return true;
                }
            }
        }
    
        return false;
    }

    // 添加圖片轉換動畫
    startTransition() {
        this.isTransitioning = true;
        this.fadeAlpha = 0;
        this.congratsAlpha = 0;
        
        // 開始轉換動畫
        const animate = () => {
            if (this.fadeAlpha < 1) {
                this.fadeAlpha += 0.02; // 控制漸變速度
                requestAnimationFrame(animate);
            } else {
                // 當圖片完全切換後，開始顯示文字
                this.showCongratulation();
            }
        };
        
        animate();
    }

    // 顯示祝賀文字
    showCongratulation() {
        const animateText = () => {
            if (this.congratsAlpha < 1) {
                this.congratsAlpha += 0.02; // 控制文字顯示速度
                requestAnimationFrame(animateText);
            }
        };
        
        animateText();

        // 3秒後隱藏祝賀文字
        if (this.congratsTimeout) {
            clearTimeout(this.congratsTimeout);
        }
        this.congratsTimeout = setTimeout(() => {
            const fadeOutText = () => {
                if (this.congratsAlpha > 0) {
                    this.congratsAlpha -= 0.02; // 控制文字消失速度
                    requestAnimationFrame(fadeOutText);
                }
            };
            fadeOutText();
        }, 10000);
    }

    // 添加新的方法檢查是否到達終點
    checkEndpoint() {
        if (this.hasReachedEnd) return;

        const distance = Math.sqrt(
            (this.target.x - this.endpoint.x) ** 2 + 
            (this.target.y - this.endpoint.y) ** 2
        );

         // 考慮縮放後的半徑
         const scaledRadius = this.endpoint.radius * this.zoomFactor;

        if (distance < this.endpoint.radius + this.target.radius) {
            this.hasReachedEnd = true;
            this.startTransition();
        }
    }

    // 更新繪製函數
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製迷宮背景
        if (gameState.isInitialized) {
            this.ctx.save();
            this.ctx.translate(this.offsetX, this.offsetY);
            this.ctx.scale(this.zoomFactor, this.zoomFactor);

            // 繪製原始圖片
            this.ctx.drawImage(
                this.mazeImage,
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );

            // 如果正在轉換，疊加彩色圖片
            if (this.isTransitioning) {
                this.ctx.globalAlpha = this.fadeAlpha;
                this.ctx.drawImage(
                    this.coloredImage,
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );
                this.ctx.globalAlpha = 1;
            }

            this.ctx.restore();
        }

        // 繪製地點物件
        this.drawLocations();

        // 繪製目標和軌跡
        this.drawTarget();

        // 檢查是否到達終點
        this.checkEndpoint();

        // 如果正在顯示祝賀文字
        if (this.congratsAlpha > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = this.congratsAlpha;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = 'gold';
            this.ctx.font = 'bold 72px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // 添加文字陰影效果
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 5;
            this.ctx.shadowOffsetY = 5;
            
            // 繪製文字並添加簡單的動畫效果
            const baseY = this.canvas.height / 2;
            const amplitude = 10; // 上下浮動的幅度
            const frequency = 0.002; // 浮動的頻率
            const y = baseY + Math.sin(Date.now() * frequency) * amplitude;
            
            this.ctx.fillText('恭喜通關！', this.canvas.width / 2, y);
            this.ctx.restore();
        }

        // 其他載入中或錯誤訊息的繪製保持不變
        if (gameState.isLoading) {
            this.drawMessage('載入中...');
        } else if (gameState.error) {
            this.drawMessage(gameState.error, 'red');
        }
    }

    // 繪製地點物件
drawLocations() {
    // 定義不同位置組的字體大小
    const fontSizes = {
        locations1: 12,
        locations2: 24,
        locations3: 12, 
        locations4: 6,
        locations5: 6
    };
    
    // 定義要垂直排列文字的位置組
    const verticalTextLocations = ['locations3', 'locations5'];
    
    // 遍歷所有位置組
    for (const locationType in fontSizes) {
        if (!this[locationType] || !Array.isArray(this[locationType])) continue;
        
        const fontSize = fontSizes[locationType] * this.zoomFactor;
        const isVertical = verticalTextLocations.includes(locationType);
        
        this[locationType].forEach(loc => {
            const scaledX = loc.x * this.zoomFactor + this.offsetX;
            const scaledY = loc.y * this.zoomFactor + this.offsetY;
            const scaledWidth = loc.width * this.zoomFactor;
            const scaledHeight = loc.height * this.zoomFactor;

            // 繪製半透明背景
            this.ctx.fillStyle = loc.color;
            this.ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

            // 設置文字樣式
            this.ctx.fillStyle = 'black';
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            if (isVertical) {
                // 垂直排列文字
                const chars = loc.text.split('');
                const totalHeight = chars.length * fontSize;
                const startY = scaledY + (scaledHeight - totalHeight) / 2;
                const centerX = scaledX + scaledWidth / 2;

                // 逐個繪製字符
                chars.forEach((char, index) => {
                    const charY = startY + (index + 0.5) * fontSize;
                    this.ctx.fillText(char, centerX, charY);
                });
            } else {
                // 水平排列文字
                this.ctx.fillText(
                    loc.text,
                    scaledX + scaledWidth / 2,
                    scaledY + scaledHeight / 2
                );
            }
        });
    }
}
    
    visualizeCollisionMap() {
        if (!this.collisionMap) {
            console.error("碰撞地圖未生成！");
            return;
        }
    
        this.ctx.save();
    
        // 考慮偏移與縮放
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomFactor, this.zoomFactor);
    
        // 遍歷碰撞地圖
        for (let y = 0; y < this.collisionMap.length; y++) {
            for (let x = 0; x < this.collisionMap[0].length; x++) {
                if (this.collisionMap[y][x] === 1) {
                    // 使用半透明紅色繪製障礙物
                    this.ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
                    this.ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    
        this.ctx.restore();
    }

    drawTarget() {
        const scaledRadius = this.target.radius * this.zoomFactor;

        // 繪製軌跡
        if (this.target.trail.length > 1) {
            this.ctx.strokeStyle = `rgba(255, 0, 0, ${config.trailOpacity})`;
            this.ctx.lineWidth = 4* this.zoomFactor; // 設定軌跡的粗細
            this.ctx.beginPath();
            this.ctx.moveTo(this.target.trail[0].x, this.target.trail[0].y);
            this.target.trail.forEach(point => {
                this.ctx.lineTo(point.x, point.y);
            });
            this.ctx.stroke();
        }

        // 繪製目標外框
        this.ctx.strokeStyle = this.target.borderColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.target.x, this.target.y, scaledRadius + 2, 0, Math.PI * 2);
        this.ctx.stroke();

        // 繪製目標填充
        this.ctx.fillStyle = this.target.color;
        this.ctx.beginPath();
        this.ctx.arc(this.target.x, this.target.y, scaledRadius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawMessage(message, color = 'black') {
        this.ctx.fillStyle = color;
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            message,
            this.canvas.width / 2,
            this.canvas.height / 2
        );
    }

    startGameLoop() {
        const gameLoop = () => {
            this.draw();
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }
}

// 初始化遊戲
const game = new MazeGame('gameCanvas');
