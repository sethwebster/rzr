type InjectedScriptsParams = {
  headerHeight: number;
  radialEnabled: boolean;
};

export function buildInjectedScripts({
  headerHeight,
  radialEnabled,
}: InjectedScriptsParams) {
  const injectedCSS = `
    html,body{
      background:#050816!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
      touch-action:pan-y!important;
      -webkit-user-select:none!important;
      user-select:none!important;
      -webkit-touch-callout:none!important;
    }
    *{
      -webkit-user-select:none!important;
      user-select:none!important;
      -webkit-touch-callout:none!important;
      caret-color:transparent!important;
    }
    .classic-screen{
      padding-top:${headerHeight}px!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
    }
    body>*{
      max-width:100%!important;
    }
    html.xterm-renderer, html.xterm-renderer body{
      overflow:hidden!important;
      overscroll-behavior:none!important;
      touch-action:none!important;
      height:100%!important;
    }
    html.xterm-renderer .app,
    html.xterm-renderer .card,
    html.xterm-renderer .screen-wrap,
    html.xterm-renderer .screen-shell,
    html.xterm-renderer .xterm-screen,
    html.xterm-renderer #terminal{
      min-height:0!important;
    }
  `;

  const injectedBeforeLoad = `
    (function(){
      var css=${JSON.stringify(injectedCSS)};
      var s=document.createElement('style');
      s.textContent=css;
      document.documentElement.appendChild(s);

      var lockX=function(){
        if(window.scrollX!==0){
          window.scrollTo(0, window.scrollY || 0);
        }
        if(document.documentElement){
          document.documentElement.style.overflowX='hidden';
        }
        if(document.body){
          document.body.style.overflowX='hidden';
        }
      };

      if(!${JSON.stringify(radialEnabled)}){
        return;
      }

      var RADIAL_HOLD_MS=520;
      var RADIAL_SCROLL_INTENT_SLOP=8;
      var RADIAL_SCROLL_ESCAPE_SLOP=22;

      var postRadial=function(type,x,y,interactionId){
        if(!${JSON.stringify(radialEnabled)} || !window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          __rzrRadial:true,
          id:interactionId,
          type:type,
          x:x,
          y:y
        }));
      };

      var swallowTextInteraction=function(e){
        var target=e.target;
        if(target && (
          target.tagName==='INPUT' ||
          target.tagName==='TEXTAREA' ||
          target.isContentEditable
        )){
          return;
        }
        e.preventDefault();
      };

      var findTouchById=function(touches,id){
        if(id===null || !touches) return null;
        for(var i=0;i<touches.length;i+=1){
          if(touches[i].identifier===id){
            return touches[i];
          }
        }
        return null;
      };

      function RadialIntentCoordinator(){
        this.interactionId=0;
        this.touchId=null;
        this.startX=0;
        this.startY=0;
        this.lastX=0;
        this.lastY=0;
        this.lockedScrollY=0;
        this.phase='idle';
        this.timer=null;
      }

      RadialIntentCoordinator.prototype.clearTimer=function(){
        if(this.timer){
          clearTimeout(this.timer);
          this.timer=null;
        }
      };

      RadialIntentCoordinator.prototype.reset=function(){
        this.clearTimer();
        this.touchId=null;
        this.phase='idle';
      };

      RadialIntentCoordinator.prototype.shouldLockScroll=function(){
        return this.phase==='active';
      };

      RadialIntentCoordinator.prototype.lockScroll=function(){
        if(window.scrollY!==this.lockedScrollY){
          window.scrollTo(0, this.lockedScrollY);
        }
        lockX();
      };

      RadialIntentCoordinator.prototype.begin=function(touch){
        if(!${JSON.stringify(radialEnabled)}) return;
        if(this.phase!=='idle' || !touch) return;

        this.touchId=touch.identifier;
        this.startX=touch.clientX;
        this.startY=touch.clientY;
        this.lastX=touch.clientX;
        this.lastY=touch.clientY;
        this.lockedScrollY=window.scrollY || 0;
        this.phase='pending';
        this.interactionId += 1;
        postRadial('hold-start', this.startX, this.startY, this.interactionId);

        var self=this;
        this.timer=setTimeout(function(){
          if(self.phase!=='pending') return;
          self.phase='active';
          self.lockScroll();
          postRadial('activate', self.lastX, self.lastY, self.interactionId);
        }, RADIAL_HOLD_MS);
      };

      RadialIntentCoordinator.prototype.onMove=function(touch,e){
        if(!touch || this.phase==='idle') return;

        this.lastX=touch.clientX;
        this.lastY=touch.clientY;

        if(this.phase==='scrolling'){
          return;
        }

        var radialDx=touch.clientX-this.startX;
        var radialDy=touch.clientY-this.startY;
        var absDx=Math.abs(radialDx);
        var absDy=Math.abs(radialDy);
        var radialDistance=Math.sqrt(radialDx*radialDx + radialDy*radialDy);

        if(this.phase==='pending'){
          if(
            absDy > RADIAL_SCROLL_INTENT_SLOP &&
            absDy > absDx + 2
          ){
            postRadial('cancel', touch.clientX, touch.clientY, this.interactionId);
            this.clearTimer();
            this.phase='scrolling';
            return;
          }
          if(radialDistance>RADIAL_SCROLL_ESCAPE_SLOP){
            postRadial('cancel', touch.clientX, touch.clientY, this.interactionId);
            this.clearTimer();
            this.phase='scrolling';
            return;
          }
          postRadial('hold-move', touch.clientX, touch.clientY, this.interactionId);
          return;
        }

        if(this.phase==='active'){
          e.preventDefault();
          this.lockScroll();
          postRadial('move', touch.clientX, touch.clientY, this.interactionId);
        }
      };

      RadialIntentCoordinator.prototype.onEnd=function(touch){
        if(this.phase==='idle') return;

        var releaseX=touch ? touch.clientX : this.lastX;
        var releaseY=touch ? touch.clientY : this.lastY;

        if(this.phase==='active'){
          postRadial('release', releaseX, releaseY, this.interactionId);
        }else if(this.phase==='pending'){
          postRadial('cancel', releaseX, releaseY, this.interactionId);
        }

        this.reset();
      };

      RadialIntentCoordinator.prototype.onCancel=function(touch){
        if(this.phase==='idle') return;

        if(this.phase!=='scrolling'){
          var cancelX=touch ? touch.clientX : this.lastX;
          var cancelY=touch ? touch.clientY : this.lastY;
          postRadial('cancel', cancelX, cancelY, this.interactionId);
        }

        this.reset();
      };

      RadialIntentCoordinator.prototype.forceCancel=function(){
        this.onCancel(null);
      };

      var coordinator=new RadialIntentCoordinator();

      window.addEventListener('scroll', lockX, { passive: true });
      window.addEventListener('scroll', function(){
        if(coordinator.shouldLockScroll()){
          coordinator.lockScroll();
        }
      }, { passive: true });
      document.addEventListener('selectstart', swallowTextInteraction, { passive: false });
      document.addEventListener('contextmenu', swallowTextInteraction, { passive: false });
      document.addEventListener('dblclick', swallowTextInteraction, { passive: false });
      window.addEventListener('blur', function(){
        coordinator.forceCancel();
      });
      window.addEventListener('pagehide', function(){
        coordinator.forceCancel();
      });
      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState!=='visible'){
          coordinator.forceCancel();
        }
      });
      window.addEventListener('touchstart', function(e){
        if(!e.touches || !e.touches.length) return;
        if(e.touches.length!==1){
          coordinator.forceCancel();
          return;
        }
        coordinator.begin(e.touches[0]);
      }, { passive: true });
      window.addEventListener('touchmove', function(e){
        if(!e.touches || !e.touches.length) return;
        var trackedTouch=findTouchById(e.touches, coordinator.touchId) || e.touches[0];
        var dx=Math.abs(trackedTouch.clientX-coordinator.startX);
        var dy=Math.abs(trackedTouch.clientY-coordinator.startY);
        if(dx>dy){
          e.preventDefault();
          lockX();
        }

        if(!${JSON.stringify(radialEnabled)}) return;
        trackedTouch=findTouchById(e.touches, coordinator.touchId);
        if(!trackedTouch) return;
        coordinator.onMove(trackedTouch,e);
      }, { passive: false });

      window.addEventListener('touchend', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, coordinator.touchId);
        coordinator.onEnd(trackedTouch);
      }, { passive: true });

      window.addEventListener('touchcancel', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, coordinator.touchId);
        coordinator.onCancel(trackedTouch);
      }, { passive: false });

      lockX();
    })();
    true;
  `;

  const injectedAfterLoad = `
    (function(){
      var s=document.createElement('style');
      s.textContent=${JSON.stringify(injectedCSS)};
      document.head.appendChild(s);
      document.documentElement.style.overflowX='hidden';
      if(document.body){
        document.body.style.overflowX='hidden';
      }
      if(window.scrollX!==0){
        window.scrollTo(0, window.scrollY || 0);
      }
    })();
    true;
  `;

  return { injectedBeforeLoad, injectedAfterLoad };
}
