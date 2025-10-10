class VideoPlayer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.options = {
      src: options.src || '',
      poster: options.poster || '',
      autoplay: options.autoplay || false,
      loop: options.loop || false,
      muted: options.muted || false,
      controls: options.controls !== false,
      width: options.width || '100%',
      height: options.height || 'auto'
    };
    
    this.isPlaying = false;
    this.isFullscreen = false;
    
    this.init();
  }
  
  init() {
    this.createPlayer();
    if (this.options.controls) {
      this.createControls();
    }
    this.attachEventListeners();
  }
  
  createPlayer() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'video-player-wrapper';
    this.wrapper.style.cssText = `
      position: relative;
      width: ${this.options.width};
      height: ${this.options.height};
      background: #000;
      overflow: hidden;
    `;
    
    this.video = document.createElement('video');
    this.video.className = 'video-player-video';
    this.video.style.cssText = 'width: 100%; height: 100%; display: block;';
    this.video.src = this.options.src;
    this.video.poster = this.options.poster;
    this.video.autoplay = this.options.autoplay;
    this.video.loop = this.options.loop;
    this.video.muted = this.options.muted;
    
    this.wrapper.appendChild(this.video);
    this.container.appendChild(this.wrapper);
  }
  
  createControls() {
    this.controlsBar = document.createElement('div');
    this.controlsBar.className = 'video-player-controls';
    this.controlsBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.7));
      padding: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    
    // Play/Pause button
    this.playBtn = document.createElement('button');
    this.playBtn.innerHTML = '▶';
    this.playBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 5px 10px;
    `;
    
    // Progress bar
    this.progressContainer = document.createElement('div');
    this.progressContainer.style.cssText = `
      flex: 1;
      height: 6px;
      background: rgba(255,255,255,0.3);
      border-radius: 3px;
      cursor: pointer;
      position: relative;
    `;
    
    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      height: 100%;
      background: #ff0000;
      border-radius: 3px;
      width: 0%;
      transition: width 0.1s;
    `;
    
    this.progressContainer.appendChild(this.progressBar);
    
    // Time display
    this.timeDisplay = document.createElement('span');
    this.timeDisplay.style.cssText = `
      color: white;
      font-size: 14px;
      font-family: monospace;
    `;
    this.timeDisplay.textContent = '0:00 / 0:00';
    
    // Volume button
    this.volumeBtn = document.createElement('button');
    this.volumeBtn.innerHTML = '🔊';
    this.volumeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 5px 10px;
    `;
    
    // Fullscreen button
    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.innerHTML = '⛶';
    this.fullscreenBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 5px 10px;
    `;
    
    this.controlsBar.appendChild(this.playBtn);
    this.controlsBar.appendChild(this.progressContainer);
    this.controlsBar.appendChild(this.timeDisplay);
    this.controlsBar.appendChild(this.volumeBtn);
    this.controlsBar.appendChild(this.fullscreenBtn);
    
    this.wrapper.appendChild(this.controlsBar);
  }
  
  attachEventListeners() {
    // Video history tracking
    this.video.addEventListener('timeupdate', () => {
      if (window.videoHistory) {
        window.videoHistory.saveProgress(
          this.options.src,
          this.options.src.split('/').pop(),
          this.video.currentTime,
          this.video.duration
        );
      }
      this.updateProgress();
    });
    
    if (this.options.controls) {
      this.playBtn.addEventListener('click', () => this.togglePlay());
      this.volumeBtn.addEventListener('click', () => this.toggleMute());
      this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
      this.progressContainer.addEventListener('click', (e) => this.seek(e));
      
      this.wrapper.addEventListener('mouseenter', () => {
        this.controlsBar.style.opacity = '1';
      });
      
      this.wrapper.addEventListener('mouseleave', () => {
        this.controlsBar.style.opacity = '0';
      });
    }
    
    this.video.addEventListener('click', () => this.togglePlay());
    this.video.addEventListener('loadedmetadata', () => this.updateTimeDisplay());
    this.video.addEventListener('play', () => this.onPlay());
    this.video.addEventListener('pause', () => this.onPause());
  }
  
  togglePlay() {
    if (this.video.paused) {
      this.play();
    } else {
      this.pause();
    }
  }
  
  play() {
    this.video.play();
  }
  
  pause() {
    this.video.pause();
  }
  
  onPlay() {
    this.isPlaying = true;
    if (this.playBtn) {
      this.playBtn.innerHTML = '⏸';
    }
  }
  
  onPause() {
    this.isPlaying = false;
    if (this.playBtn) {
      this.playBtn.innerHTML = '▶';
    }
  }
  
  toggleMute() {
    this.video.muted = !this.video.muted;
    this.volumeBtn.innerHTML = this.video.muted ? '🔇' : '🔊';
  }
  
  toggleFullscreen() {
    if (!this.isFullscreen) {
      if (this.wrapper.requestFullscreen) {
        this.wrapper.requestFullscreen();
      } else if (this.wrapper.webkitRequestFullscreen) {
        this.wrapper.webkitRequestFullscreen();
      } else if (this.wrapper.mozRequestFullScreen) {
        this.wrapper.mozRequestFullScreen();
      }
      this.isFullscreen = true;
      this.fullscreenBtn.innerHTML = '⛶';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      }
      this.isFullscreen = false;
      this.fullscreenBtn.innerHTML = '⛶';
    }
  }
  
  seek(e) {
    const rect = this.progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    this.video.currentTime = pos * this.video.duration;
  }
  
  updateProgress() {
    const progress = (this.video.currentTime / this.video.duration) * 100;
    if (this.progressBar) {
      this.progressBar.style.width = progress + '%';
    }
    this.updateTimeDisplay();
  }
  
  updateTimeDisplay() {
    if (this.timeDisplay) {
      const current = this.formatTime(this.video.currentTime);
      const duration = this.formatTime(this.video.duration);
      this.timeDisplay.textContent = `${current} / ${duration}`;
    }
  }
  
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  setSrc(src) {
    this.video.src = src;
  }
  
  setVolume(volume) {
    this.video.volume = Math.max(0, Math.min(1, volume));
  }
  
  destroy() {
    this.video.pause();
    this.container.removeChild(this.wrapper);
  }
}