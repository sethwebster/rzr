type InjectedScriptsParams = {
  headerHeight: number;
  composerReservedHeight: number;
  radialEnabled: boolean;
};

export function buildInjectedScripts({
  headerHeight,
  composerReservedHeight,
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
    .screen{
      padding-top:${headerHeight}px!important;
      padding-bottom:var(--rzr-composer-inset, ${composerReservedHeight}px)!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
    }
    body>*{
      max-width:100%!important;
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

      window.__rzrSetComposerInset=function(px){
        var value=Math.max(0, Math.round(px || 0)) + 'px';
        document.documentElement.style.setProperty('--rzr-composer-inset', value);
      };
      window.__rzrSetComposerInset(${composerReservedHeight});

      var touchStartX=0;
      var touchStartY=0;
      var radialTouchId=null;
      var radialStartX=0;
      var radialStartY=0;
      var radialLastX=0;
      var radialLastY=0;
      var radialActivated=false;
      var radialTimer=null;
      var radialLockedScrollY=0;
      var RADIAL_HOLD_MS=520;
      var RADIAL_SCROLL_ESCAPE_SLOP=22;

      var postRadial=function(type,x,y){
        if(!${JSON.stringify(radialEnabled)} || !window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          __rzrRadial:true,
          type:type,
          x:x,
          y:y
        }));
      };

      var clearRadial=function(){
        if(radialTimer){
          clearTimeout(radialTimer);
          radialTimer=null;
        }
      };

      var lockRadialScroll=function(){
        if(window.scrollY!==radialLockedScrollY){
          window.scrollTo(0, radialLockedScrollY);
        }
        lockX();
      };

      var resetRadial=function(){
        clearRadial();
        radialTouchId=null;
        radialActivated=false;
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

      window.addEventListener('scroll', lockX, { passive: true });
      window.addEventListener('scroll', function(){
        if(radialTouchId!==null || radialActivated){
          lockRadialScroll();
        }
      }, { passive: true });
      document.addEventListener('selectstart', swallowTextInteraction, { passive: false });
      document.addEventListener('contextmenu', swallowTextInteraction, { passive: false });
      document.addEventListener('dblclick', swallowTextInteraction, { passive: false });
      window.addEventListener('touchstart', function(e){
        if(!e.touches || !e.touches.length) return;
        touchStartX=e.touches[0].clientX;
        touchStartY=e.touches[0].clientY;

        if(!${JSON.stringify(radialEnabled)}) return;
        if(e.touches.length!==1 || radialTouchId!==null) return;

        radialTouchId=e.touches[0].identifier;
        radialStartX=e.touches[0].clientX;
        radialStartY=e.touches[0].clientY;
        radialLastX=radialStartX;
        radialLastY=radialStartY;
        radialLockedScrollY=window.scrollY || 0;
        radialActivated=false;
        postRadial('hold-start', radialStartX, radialStartY);
        radialTimer=setTimeout(function(){
          if(radialTouchId===null) return;
          radialActivated=true;
          lockRadialScroll();
          postRadial('activate', radialLastX, radialLastY);
        }, RADIAL_HOLD_MS);
      }, { passive: true });
      window.addEventListener('touchmove', function(e){
        if(!e.touches || !e.touches.length) return;
        var dx=Math.abs(e.touches[0].clientX-touchStartX);
        var dy=Math.abs(e.touches[0].clientY-touchStartY);
        if(dx>dy){
          e.preventDefault();
          lockX();
        }

        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.touches, radialTouchId);
        if(!trackedTouch) return;

        radialLastX=trackedTouch.clientX;
        radialLastY=trackedTouch.clientY;

        var radialDx=trackedTouch.clientX-radialStartX;
        var radialDy=trackedTouch.clientY-radialStartY;
        var radialDistance=Math.sqrt(radialDx*radialDx + radialDy*radialDy);

        if(!radialActivated){
          if(radialDistance>RADIAL_SCROLL_ESCAPE_SLOP){
            postRadial('cancel', trackedTouch.clientX, trackedTouch.clientY);
            resetRadial();
            return;
          }
          e.preventDefault();
          lockRadialScroll();
          postRadial('hold-move', trackedTouch.clientX, trackedTouch.clientY);
          return;
        }

        e.preventDefault();
        postRadial('move', trackedTouch.clientX, trackedTouch.clientY);
        lockRadialScroll();
      }, { passive: false });

      window.addEventListener('touchend', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, radialTouchId);
        if(!trackedTouch && radialTouchId===null) return;
        var releaseX=trackedTouch ? trackedTouch.clientX : radialLastX;
        var releaseY=trackedTouch ? trackedTouch.clientY : radialLastY;

        if(radialActivated){
          postRadial('release', releaseX, releaseY);
        }else{
          postRadial('cancel', releaseX, releaseY);
        }
        resetRadial();
      }, { passive: true });

      window.addEventListener('touchcancel', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, radialTouchId);
        if(trackedTouch){
          postRadial('cancel', trackedTouch.clientX, trackedTouch.clientY);
        }else if(radialTouchId!==null){
          postRadial('cancel', radialLastX, radialLastY);
        }
        resetRadial();
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
      window.__rzrSetComposerInset=function(px){
        var value=Math.max(0, Math.round(px || 0)) + 'px';
        document.documentElement.style.setProperty('--rzr-composer-inset', value);
      };
      window.__rzrSetComposerInset(${composerReservedHeight});
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
