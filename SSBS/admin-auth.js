(async()=>{
  const note=document.createElement('div'); note.className='admin-auth-note'; note.textContent='Checking secure access…'; document.body.prepend(note);
  if(!window.ssbsSupabase){note.textContent='Authentication service could not load.';return}
  const {data:{user}}=await window.ssbsSupabase.auth.getUser();
  if(!user){location.replace('admin-login.html');return}
  const {data:admin}=await window.ssbsSupabase.from('admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(!admin){await window.ssbsSupabase.auth.signOut();location.replace('admin-login.html?denied=1');return}
  note.textContent=`Signed in: ${user.email}`; document.body.classList.add('admin-authorized');
})();
