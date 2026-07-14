#!/usr/bin/env node
//
// inject-legacy-boot.js
//
// After `enact pack`, rewrite dist/index.html so WebKit / webOS 1–2 devices
// load the cut-down legacy shell instead of React/xterm (which blank-screens).
//
// Detection mirrors src/compat/platform.js tier === 'legacy-webkit':
//   - no Chrome/ token and AppleWebKit ≤ 538, or
//   - PalmSystem/webOSSystem sdkVersion major ≤ 2

const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../dist/index.html');

if (!fs.existsSync(indexPath)) {
	console.error('inject-legacy-boot: dist/index.html not found — run enact pack first');
	process.exit(1);
}

const bootScript = `(function(){
var ua=navigator.userAgent||'';
function chromeMajor(){var m=/Chrome\\/(\\d+)/i.exec(ua);return m?parseInt(m[1],10):null;}
function webkitMajor(){var m=/AppleWebKit\\/([\\d.]+)/i.exec(ua);return m?parseInt(m[1],10):null;}
function sdkMajor(){
  try{
    var sys=window.webOSSystem||window.PalmSystem;
    if(!sys)return null;
    var raw=sys.deviceInfo||null;
    var ver=null;
    if(raw&&typeof raw==='string'){
      try{var info=JSON.parse(raw);ver=info.sdkVersion||info.version||null;}catch(e){}
    }
    if(!ver)ver=sys.version||null;
    if(!ver||typeof ver!=='string')return null;
    var m=/^(\\d+)/.exec(ver.replace(/^\\s+/,''));
    return m?parseInt(m[1],10):null;
  }catch(e2){return null;}
}
function useLegacy(){
  try{
    if(/[?&]legacy=1(?:&|$)/.test(location.search||''))return true;
    if(window.localStorage&&localStorage.getItem('webosTerminalForceLegacy')==='1')return true;
  }catch(e0){}
  var cm=chromeMajor();
  if(cm!=null)return false;
  var sm=sdkMajor();
  if(sm!=null&&sm<=2)return true;
  var wm=webkitMajor();
  if(wm!=null&&wm<=538)return true;
  if((/Web0S|webOS|WebOS/i.test(ua))&&cm==null&&wm!=null)return true;
  return false;
}
function loadCss(href){
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.href=href;
  document.head.appendChild(l);
}
function loadJs(src,defer){
  var s=document.createElement('script');
  if(defer)s.defer=true;
  s.src=src;
  document.body.appendChild(s);
}
if(useLegacy()){
  loadCss('legacy-webos2.css');
  loadJs('legacy-webos2.js',false);
}else{
  loadCss('main.css');
  loadJs('main.js',true);
}
})();`;

const html = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no">
<title>webOS Terminal</title>
</head>
<body>
<div id="root"></div>
<script>
${bootScript}
</script>
</body>
</html>
`;

fs.writeFileSync(indexPath, html);
console.log('inject-legacy-boot: wrote dual-boot dist/index.html (legacy WebKit → legacy-webos2.js)');
