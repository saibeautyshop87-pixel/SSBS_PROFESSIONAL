const ADMIN_SUPABASE_URL='https://jatgrsfwnisfiqndwuho.supabase.co';
const ADMIN_SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdGdyc2Z3bmlzZmlxbmR3dWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MjM1OTYsImV4cCI6MjEwMTM5OTU5Nn0.HLnkZQZ5ON9sHrwGFKB55BTRfD-MZVEcbzUnKx4HciQ';
const loginForm=document.querySelector('#admin-login-form');
const loginMessage=document.querySelector('#login-error');
const authHeaders={apikey:ADMIN_SUPABASE_KEY,'Content-Type':'application/json'};

async function authRequest(path,body){
  let response;
  try{
    response=await fetch(`${ADMIN_SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:authHeaders,body:JSON.stringify(body)});
  }catch{
    throw new Error('Unable to reach the sign-in service. Check your connection and try again.');
  }
  let data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error_description||data.msg||data.message||'Unable to complete this request.');
  return data;
}

loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  let button=loginForm.querySelector('button[type="submit"]'),formData=new FormData(loginForm);
  button.disabled=true;
  loginForm.setAttribute('aria-busy','true');
  loginMessage.className='login-error';
  loginMessage.textContent='Signing in securely…';
  try{
    let data=await authRequest('token?grant_type=password',{email:String(formData.get('email')).trim(),password:formData.get('password')});
    localStorage.setItem('ssbs_admin_session',JSON.stringify(data));
    location.replace('admin.html');
  }catch(error){
    loginMessage.className='login-error is-error';
    loginMessage.textContent=error.message;
  }finally{
    button.disabled=false;
    loginForm.removeAttribute('aria-busy');
  }
});

document.querySelector('[data-toggle-password]')?.addEventListener('click',event=>{
  let input=loginForm.elements.password,show=input.type==='password';
  input.type=show?'text':'password';
  event.currentTarget.textContent=show?'Hide':'Show';
  event.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');
});

document.querySelector('#admin-reset-password')?.addEventListener('click',async event=>{
  let email=String(loginForm.elements.email.value||'').trim();
  if(!email){
    loginForm.elements.email.focus();
    loginMessage.className='login-error is-error';
    loginMessage.textContent='Enter your admin email first.';
    return;
  }
  event.currentTarget.disabled=true;
  loginMessage.className='login-error';
  loginMessage.textContent='Sending reset link…';
  try{
    await authRequest('recover',{email});
    loginMessage.className='login-error is-success';
    loginMessage.textContent='Password reset email sent. Check your inbox.';
  }catch(error){
    loginMessage.className='login-error is-error';
    loginMessage.textContent=error.message;
  }finally{
    event.currentTarget.disabled=false;
  }
});

if(new URLSearchParams(location.search).has('denied')){
  loginMessage.className='login-error is-error';
  loginMessage.textContent='This account is not authorised for SSBS admin access.';
}
if(new URLSearchParams(location.search).has('signedout')){
  loginMessage.className='login-error is-success';
  loginMessage.textContent='You have been signed out safely.';
}
