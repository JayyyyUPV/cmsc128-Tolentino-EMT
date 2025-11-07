document.addEventListener("DOMContentLoaded", () => {
  const loginBox = document.getElementById("loginBox");
  const signupBox = document.getElementById("signupBox");
  const showSignup = document.getElementById("showSignup");
  const showLogin = document.getElementById("showLogin");
  const authForms = document.querySelectorAll(".auth-form");
  const signupForm = document.querySelector('#signupBox .auth-form');
  const forgotBox = document.getElementById('forgotBox');
  const showForgot = document.getElementById('showForgot');
  const hideForgot = document.getElementById('hideForgot');
  const forgotForm = document.getElementById('forgotForm');

  if (showSignup) {
    showSignup.addEventListener("click", (e) => {
      e.preventDefault();
      loginBox.classList.add("hidden");
      signupBox.classList.remove("hidden");
      if (forgotBox) forgotBox.classList.add("hidden");
      // Show login form inside loginBox if present
      const loginForm = loginBox.querySelector('form.auth-form');
      if (loginForm) loginForm.classList.remove('hidden');
    });
  }

  if (showLogin) {
    showLogin.addEventListener("click", (e) => {
      e.preventDefault();
      signupBox.classList.add("hidden");
      loginBox.classList.remove("hidden");
      if (forgotBox) forgotBox.classList.add('hidden');
      // Show login form inside loginBox if present
      const loginForm = loginBox.querySelector('form.auth-form');
      if (loginForm) loginForm.classList.remove('hidden');
    });
  }

  // Forgot password toggles
  if (showForgot && forgotBox) {
    showForgot.addEventListener('click', (e) => {
      e.preventDefault();
      loginBox.classList.remove('hidden');
      signupBox.classList.add('hidden');
      forgotBox.classList.remove('hidden');
      // Hide login form inside loginBox
      const loginForm = loginBox.querySelector('form.auth-form');
      if (loginForm) loginForm.classList.add('hidden');
    });
  }
  if (hideForgot && forgotBox) {
    hideForgot.addEventListener('click', (e) => {
      e.preventDefault();
      forgotBox.classList.add('hidden');
      loginBox.classList.remove('hidden');
      signupBox.classList.add('hidden');
      // Show login form inside loginBox
      const loginForm = loginBox.querySelector('form.auth-form');
      if (loginForm) loginForm.classList.remove('hidden');
    });
  }

  // Intercept form submissions to use AJAX and show inline errors
  authForms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      // If this is the signup form, validate password complexity first
      if (form === signupForm) {
        const pwd = form.querySelector('input[name="password"]').value || '';
        const missing = [];
        if (!/[0-9]/.test(pwd)) missing.push('a number');
        if (!/[A-Z]/.test(pwd)) missing.push('an uppercase letter');
        if (!/[a-z]/.test(pwd)) missing.push('a lowercase letter');
        if (missing.length) {
          await showCustomAlert(`Password must include ${missing.join(', ')}.`);
          return;
        }
      }

      const formData = new FormData(form);
      try {
        const res = await fetch("/auth", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formData,
        });
        const contentType = res.headers.get('Content-Type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await res.json() : {};
        if (!res.ok || (isJson && data && data.ok === false)) {
          const message = (isJson && data.error) ? data.error : `Request failed (${res.status}).`;
          await showCustomAlert(message);
          return;
        }
        // Success: either account created or logged in
        if (isJson && data.redirect) {
          window.location.href = data.redirect;
        } else if (isJson && data.message) {
          await showCustomAlert(data.message);
          // If it was signup success, switch to login
          if (showLogin) showLogin.click();
        } else {
          // Fallback: if server didn't send JSON, reload to let server redirect
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
        await showCustomAlert("Network error. Please check your connection.");
      }
    });
  });

  // Forgot password form submit (AJAX)
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const formData = new FormData(form);
      const newPwd = form.querySelector('input[name="new_password"]').value || '';
      const missing = [];
      if (!/[0-9]/.test(newPwd)) missing.push('a number');
      if (!/[A-Z]/.test(newPwd)) missing.push('an uppercase letter');
      if (!/[a-z]/.test(newPwd)) missing.push('a lowercase letter');
      if (missing.length) {
        await showCustomAlert(`New password must include ${missing.join(', ')}.`);
        return;
      }

      try {
        const res = await fetch('/forgot', { method: 'POST', headers: { Accept: 'application/json' }, body: formData });
        const contentType = res.headers.get('Content-Type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await res.json() : {};
        if (!res.ok || (isJson && data && data.ok === false)) {
          const message = (isJson && data.error) ? data.error : `Request failed (${res.status}).`;
          await showCustomAlert(message);
          return;
        }
        await showCustomAlert(isJson && data.message ? data.message : 'Password has been reset.');
        // Hide forgot box and return to login
        if (forgotBox) forgotBox.classList.add('hidden');
      } catch (err) {
        console.error(err);
        await showCustomAlert('Network error. Please check your connection.');
      }
    });
  }
});

function showCustomAlert(message, options = {}) {
  const modal = document.getElementById('customAlert');
  const msg = document.getElementById('customAlertMsg');
  const okBtn = document.getElementById('customAlertOk');
  const cancelBtn = document.getElementById('customAlertCancel');
  msg.textContent = message;
  modal.style.display = 'flex';

  // Show/hide Cancel button
  if (options.confirm) {
    cancelBtn.style.display = '';
  } else {
    cancelBtn.style.display = 'none';
  }

  // Remove old listeners
  okBtn.onclick = cancelBtn.onclick = null;

  return new Promise((resolve) => {
    okBtn.onclick = () => {
      modal.style.display = 'none';
      resolve(true);
    };
    cancelBtn.onclick = () => {
      modal.style.display = 'none';
      resolve(false);
    };
  });
}
