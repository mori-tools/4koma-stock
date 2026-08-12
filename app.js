const DB_NAME='yonkomaStockDB',STORE='items',SUPABASE_BUCKET='yonkoma-stock',SUPABASE_TABLE='yonkoma_items',CONFIG_KEY='yonkomaStockSupabaseConfig';
let db,currentFilter='all',editingId=null,previewUrl=null,sb=null,currentUser=null,syncRunning=false,syncTimer=null;
const $=s=>document.querySelector(s),nowIso=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID(),fmt=i=>new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(i));
const statusLabel={idea:'ネタ',making:'制作中',ready:'完成・未使用',used:'使用済み'},nextStatus={idea:'making',making:'ready',ready:'used',used:'ready'},nextLabel={idea:'制作中へ',making:'完成にする',ready:'使用済みにする',used:'未使用に戻す'};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:'id'});s.createIndex('createdAt','createdAt');s.createIndex('status','status')}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
const store=(m='readonly')=>db.transaction(STORE,m).objectStore(STORE);function allRaw(){return new Promise((r,j)=>{const q=store().getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}async function all(){return (await allRaw()).filter(x=>!x.deleted)}function get(id){return new Promise((r,j)=>{const q=store().get(id);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}function put(x){return new Promise((r,j)=>{const q=store('readwrite').put(x);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}
async function render(){let items=await all();for(const k of ['idea','making','ready','used'])$('#'+k+'Count').textContent=items.filter(x=>x.status===k).length;$('#totalCount').textContent=items.length;let shown=currentFilter==='all'?items:items.filter(x=>x.status===currentFilter);const sort=$('#sortSelect').value,order={idea:0,making:1,ready:2,used:3};shown.sort((a,b)=>sort==='oldest'?new Date(a.createdAt)-new Date(b.createdAt):sort==='status'?(order[a.status]-order[b.status]||new Date(b.createdAt)-new Date(a.createdAt)):new Date(b.createdAt)-new Date(a.createdAt));$('#emptyState').classList.toggle('hidden',items.length>0);const grid=$('#grid');grid.innerHTML='';for(const item of shown){const n=$('#cardTemplate').content.cloneNode(true),card=n.querySelector('.card');card.dataset.status=item.status;n.querySelector('.status-badge').textContent=statusLabel[item.status];n.querySelector('.card-title').textContent=item.title||'無題の4コマ';n.querySelector('.created-at').textContent=fmt(item.createdAt);n.querySelector('.theme').textContent=item.theme||'';const p=n.querySelector('.post-text');p.textContent=item.postText||item.memo||'';p.classList.toggle('hidden',!p.textContent);if(item.imageBlob){const u=URL.createObjectURL(item.imageBlob),img=n.querySelector('.thumb');img.src=u;img.classList.remove('hidden');n.querySelector('.no-image').classList.add('hidden');img.onload=()=>setTimeout(()=>URL.revokeObjectURL(u),1000)}n.querySelector('.image-wrap').onclick=()=>openEditor(item.id);n.querySelector('.edit-btn').onclick=()=>openEditor(item.id);n.querySelector('.copy-btn').onclick=()=>copyPost(item);n.querySelector('.image-copy-btn').onclick=()=>copyImage(item.id);n.querySelector('.next-btn').textContent=nextLabel[item.status];n.querySelector('.next-btn').onclick=()=>advance(item.id);grid.appendChild(n)}}
function setFilter(f){currentFilter=f;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.filter===f));render()}
async function copyPost(item){if(!item.postText){toast('投稿文がありません');return}try{await navigator.clipboard.writeText(item.postText);toast('投稿文をコピーしました')}catch{toast('コピーできませんでした')}}
async function copyImage(id){const item=await get(id);if(!item?.imageBlob){toast('画像がありません');return}try{let blob=item.imageBlob;if(blob.type!=='image/png'){blob=await toPng(blob)}await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('画像をコピーしました')}catch(e){console.error('image copy failed',e);toast('この環境では画像コピーが使えません')}}
function toPng(blob){return new Promise((res,rej)=>{const img=new Image();const u=URL.createObjectURL(blob);img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);c.toBlob(b=>{URL.revokeObjectURL(u);b?res(b):rej(new Error('PNG変換に失敗しました'))},'image/png')};img.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('画像を読み込めませんでした'))};img.src=u})}
async function advance(id){const x=await get(id);x.status=nextStatus[x.status];x.usedAt=x.status==='used'?nowIso():null;x.updatedAt=nowIso();await put(x);await render();scheduleSync()}
function resetEditor(){editingId=null;$('#dialogTitle').textContent='4コマを追加';$('#titleInput').value='';$('#postInput').value='';$('#memoInput').value='';$('#themeInput').value='';$('#statusInput').value='idea';$('#imageInput').value='';$('#dialogPreview').classList.add('hidden');$('#dialogPreview').removeAttribute('src');$('#dialogMeta').textContent='';$('#deleteBtn').classList.add('hidden')}
async function openEditor(id=null){resetEditor();if(id){const x=await get(id);editingId=id;$('#dialogTitle').textContent='4コマを編集';$('#titleInput').value=x.title||'';$('#postInput').value=x.postText||'';$('#memoInput').value=x.memo||'';$('#themeInput').value=x.theme||'';$('#statusInput').value=x.status||'idea';$('#dialogMeta').textContent=`登録：${fmt(x.createdAt)}${x.usedAt?' / 使用：'+fmt(x.usedAt):''}`;$('#deleteBtn').classList.remove('hidden');if(x.imageBlob){previewUrl=URL.createObjectURL(x.imageBlob);$('#dialogPreview').src=previewUrl;$('#dialogPreview').classList.remove('hidden')}}$('#editDialog').showModal()}
$('#imageInput').onchange=e=>{const f=e.target.files[0];if(!f)return;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(f);$('#dialogPreview').src=previewUrl;$('#dialogPreview').classList.remove('hidden')};
async function saveEditor(){const old=editingId?await get(editingId):null,file=$('#imageInput').files[0],status=$('#statusInput').value;const x={id:old?.id||uuid(),title:$('#titleInput').value.trim(),postText:$('#postInput').value.trim(),memo:$('#memoInput').value.trim(),theme:$('#themeInput').value.trim(),status,imageBlob:file||old?.imageBlob||null,imageName:file?.name||old?.imageName||'',imageType:file?.type||old?.imageType||'image/png',storagePath:old?.storagePath||'',createdAt:old?.createdAt||nowIso(),usedAt:status==='used'?(old?.usedAt||nowIso()):null,updatedAt:nowIso(),deleted:false};if(!x.title&&!x.postText&&!x.memo&&!x.imageBlob){toast('タイトル・投稿文・メモ・画像のどれかを入力してください');return}await put(x);$('#editDialog').close();await render();toast(editingId?'更新しました':'追加しました');scheduleSync()}
async function removeEditing(){if(!editingId||!confirm('この4コマを削除しますか？'))return;const x=await get(editingId);x.deleted=true;x.updatedAt=nowIso();await put(x);$('#editDialog').close();await render();toast('削除しました');scheduleSync()}
async function backup(){const items=await allRaw(),data=[];for(const x of items){const y={...x,imageBlob:null,imageData:null};if(x.imageBlob)y.imageData=await blobToData(x.imageBlob);data.push(y)}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,items:data},null,2)],{type:'application/json'}));a.download=`4koma-stock-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const blobToData=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});async function dataToBlob(d){return fetch(d).then(r=>r.blob())}
async function restore(file){try{const j=JSON.parse(await file.text());for(const y of j.items||[]){if(y.imageData)y.imageBlob=await dataToBlob(y.imageData);delete y.imageData;y.updatedAt=nowIso();await put(y)}await render();toast('復元しました');scheduleSync()}catch{toast('復元できませんでした')}}

function config(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch{return null}}
function saveConfig(url,key){localStorage.setItem(CONFIG_KEY,JSON.stringify({url:url.trim(),key:key.trim()}))}
function initSupabase(){
  const c=config();
  if(!c?.url||!c?.key||!window.supabase?.createClient){
    sb=null;currentUser=null;updateSyncUI('local');return false
  }
  sb=window.supabase.createClient(c.url,c.key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  return true
}
function updateSyncUI(s,msg=''){
  const el=$('#syncStatus');
  const m={local:'ローカルのみ',signedout:'同期：未ログイン',syncing:'同期中…',ok:'同期済み',error:'同期エラー',offline:'オフライン'};
  if(el){el.dataset.state=s;el.textContent=msg||m[s]||m.local}
}
async function session(){
  if(!sb){updateSyncUI('local');return}
  try{
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    currentUser=data.session?.user||null;
    updateSyncUI(currentUser?'ok':'signedout',currentUser?'同期準備完了':'同期：未ログイン');
  }catch(e){
    console.error('session error',e);currentUser=null;updateSyncUI('error')
  }
}
async function openSync(){
  const c=config()||{};
  $('#supabaseUrl').value=c.url||'';
  $('#supabaseKey').value=c.key||'';
  $('#syncPassword').value='';setAuthMessage('');
  if(sb)await session();
  $('#authPanel').classList.toggle('hidden',!sb);
  $('#loggedInPanel').classList.toggle('hidden',!currentUser);
  $('#loggedOutPanel').classList.toggle('hidden',!!currentUser);
  $('#loggedInEmail').textContent=currentUser?.email||'';
  $('#syncDialog').showModal()
}
async function saveCloud(){
  const url=$('#supabaseUrl').value.trim(),key=$('#supabaseKey').value.trim();
  if(!url||!key){toast('Project URLとPublishable / anon keyを入力してください');return}
  saveConfig(url,key);
  if(!initSupabase()){
    toast('Supabaseライブラリを読み込めませんでした。ページを再読み込みしてください');
    return
  }
  await session();
  $('#authPanel').classList.remove('hidden');
  $('#loggedInPanel').classList.toggle('hidden',!currentUser);
  $('#loggedOutPanel').classList.toggle('hidden',!!currentUser);
  toast('クラウド設定を保存しました')
}

function setAuthMessage(message,type='info'){
  const el=$('#authMessage');
  if(!el)return;
  el.textContent=message||'';
  el.style.color=type==='error'?'#b42318':type==='ok'?'#2f7d4a':'#555';
  el.style.fontWeight=type==='error'||type==='ok'?'700':'400';
}
function withTimeout(promise,ms=15000){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('通信がタイムアウトしました。ネット接続を確認してください')),ms))
  ]);
}

async function signIn(){
  try{
    setAuthMessage('ログイン中…');
    if(!sb){
      if(!initSupabase()){
        setAuthMessage('Supabase設定を読み込めません。上の「設定を保存」を押してください。','error');
        return
      }
    }
    const email=$('#syncEmail').value.trim(),password=$('#syncPassword').value;
    if(!email||!password){
      setAuthMessage('メールアドレスとパスワードを入力してください。','error');
      return
    }
    const {data,error}=await withTimeout(sb.auth.signInWithPassword({email,password}),15000);
    if(error){
      console.error('auth error',error);
      setAuthMessage(`ログインできません：${error.message}`,'error');
      return
    }
    if(!data?.user){
      setAuthMessage('ログイン情報を取得できませんでした。','error');
      return
    }
    currentUser=data.user;
    setAuthMessage('ログイン成功。同期しています…','ok');
    await syncNow(false);
    setAuthMessage('ログイン・同期できました。','ok');
    setTimeout(()=>$('#syncDialog').close(),700)
  }catch(e){
    console.error('signIn failed',e);
    setAuthMessage(`ログイン処理エラー：${e.message||'接続を確認してください'}`,'error')
  }
}
async function signUp(){
  try{
    if(!sb){
      if(!initSupabase()){toast('先にクラウド設定を保存してください');return}
    }
    const email=$('#syncEmail').value.trim(),password=$('#syncPassword').value;
    if(!email||password.length<6){toast('メールアドレスと6文字以上のパスワードを入力してください');return}
    const {data,error}=await sb.auth.signUp({email,password});
    if(error){toast(error.message);return}
    currentUser=data.session?.user||null;
    toast(currentUser?'アカウントを作成しました':'確認メールを開いて登録を完了してください');
    if(currentUser)await syncNow()
  }catch(e){console.error(e);toast(`アカウント作成エラー：${e.message||'接続を確認してください'}`)}
}
async function signOut(){
  if(!sb)return;
  await sb.auth.signOut();currentUser=null;updateSyncUI('signedout');
  $('#loggedInPanel').classList.add('hidden');$('#loggedOutPanel').classList.remove('hidden');
  toast('ログアウトしました')
}
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(true),700)}
async function syncNow(silent=false){
  if(syncRunning||!navigator.onLine)return;
  if(!sb||!currentUser){if(!silent)toast('同期するにはログインしてください');return}
  syncRunning=true;updateSyncUI('syncing');
  try{
    let local=await allRaw();
    const {data:remote,error}=await sb.from(SUPABASE_TABLE).select('*').eq('user_id',currentUser.id);
    if(error)throw error;
    const rm=new Map((remote||[]).map(r=>[r.id,r]));
    for(const x of local){
      const r=rm.get(x.id);
      if(!r||new Date(x.updatedAt)>new Date(r.updated_at)){
        let path=x.storagePath||r?.storage_path||'';
        if(x.imageBlob&&!x.deleted){
          path=path||`${currentUser.id}/${x.id}.${(x.imageType||'image/png').split('/')[1]||'png'}`;
          const body=x.imageBlob instanceof Blob ? await x.imageBlob.arrayBuffer() : x.imageBlob;
          if(!body||(body.byteLength!==undefined&&body.byteLength===0))throw new Error('画像データが空です');
          const up=await sb.storage.from(SUPABASE_BUCKET).upload(path,body,{
            upsert:true,contentType:x.imageType||x.imageBlob?.type||'image/png',cacheControl:'3600'
          });
          if(up.error)throw up.error
        }
        const row={
          id:x.id,user_id:currentUser.id,title:x.title||'',post_text:x.postText||'',memo:x.memo||'',
          theme:x.theme||'',status:x.status||'idea',created_at:x.createdAt,used_at:x.usedAt||null,
          image_name:x.imageName||'',image_type:x.imageType||'image/png',storage_path:path,
          updated_at:x.updatedAt,deleted:!!x.deleted
        };
        const q=await sb.from(SUPABASE_TABLE).upsert(row,{onConflict:'id'});
        if(q.error)throw q.error;
        x.storagePath=path;await put(x)
      }
    }
    const {data:fresh,error:fe}=await sb.from(SUPABASE_TABLE).select('*').eq('user_id',currentUser.id);
    if(fe)throw fe;
    local=await allRaw();
    const lm=new Map(local.map(x=>[x.id,x]));
    for(const r of fresh||[]){
      const l=lm.get(r.id);
      if(!l||new Date(r.updated_at)>new Date(l.updatedAt)){
        let blob=l?.imageBlob||null;
        if(r.storage_path&&!r.deleted){
          const dl=await sb.storage.from(SUPABASE_BUCKET).download(r.storage_path);
          if(dl.error)throw dl.error;
          blob=dl.data
        }
        await put({
          id:r.id,title:r.title,postText:r.post_text,memo:r.memo,theme:r.theme,status:r.status,
          imageBlob:blob,imageName:r.image_name,imageType:r.image_type,storagePath:r.storage_path,
          createdAt:r.created_at,usedAt:r.used_at,updatedAt:r.updated_at,deleted:r.deleted
        })
      }
    }
    await render();
    updateSyncUI('ok',`同期済み ${new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`);
    if(!silent)toast('スマホ / iPad用クラウドと同期しました')
  }catch(e){
    console.error('sync failed',e);updateSyncUI('error');
    if(!silent)toast(`同期できませんでした：${e.message||'設定を確認してください'}`)
  }finally{syncRunning=false}
}
$('#addBtn').onclick=()=>openEditor();$('#saveBtn').onclick=saveEditor;$('#deleteBtn').onclick=removeEditing;$('#backupBtn').onclick=backup;$('#restoreBtn').onclick=()=>$('#restoreInput').click();$('#restoreInput').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);e.target.value=''};$('.tabs').onclick=e=>{if(e.target.matches('.tab'))setFilter(e.target.dataset.filter)};document.querySelector('.summary').onclick=e=>{const b=e.target.closest('[data-filter]');if(b)setFilter(b.dataset.filter)};$('#sortSelect').onchange=render;$('#syncBtn').onclick=openSync;$('#saveCloudConfigBtn').onclick=saveCloud;window.addEventListener('online',()=>{updateSyncUI(currentUser?'ok':'signedout');scheduleSync()});window.addEventListener('offline',()=>updateSyncUI('offline'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSync()});


// v1.3: iOS/Safari向けに同期ボタン処理をwindowへ明示公開
window.yonkomaSignIn = async function(){
  try{
    await signIn();
  }catch(e){
    console.error(e);
    toast(`ログイン処理エラー：${e?.message||'接続を確認してください'}`);
  }
};
window.yonkomaSignUp = async function(){
  try{ await signUp(); }catch(e){ console.error(e); toast(`アカウント作成エラー：${e?.message||'接続を確認してください'}`); }
};
window.yonkomaSyncNow = async function(){
  try{ await syncNow(false); }catch(e){ console.error(e); toast(`同期エラー：${e?.message||'接続を確認してください'}`); }
};
window.yonkomaSignOut = async function(){
  try{ await signOut(); }catch(e){ console.error(e); toast(`ログアウトエラー：${e?.message||'もう一度お試しください'}`); }
};

(async()=>{db=await openDB();await render();if(initSupabase()){await session();if(currentUser)scheduleSync();sb.auth.onAuthStateChange((_e,s)=>{currentUser=s?.user||null;if(currentUser)scheduleSync()})}if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})})();
