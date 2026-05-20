const STYLE_ID = "eazo-sdk-login-ui";

export const LOGIN_UI_CSS = `
.eazo-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: eazo-fade-in 180ms ease-out;
}

.eazo-content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 2147483601;
  width: calc(100vw - 32px);
  max-width: 440px;
  transform: translate(-50%, -50%);
  border-radius: 28px;
  padding: 28px 28px 22px;
  background: linear-gradient(145deg, #ffffff 0%, #f8f6f3 100%);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.8);
  color: #0f172a;
  font-family: inherit;
  animation: eazo-pop-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

@keyframes eazo-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes eazo-pop-in {
  from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.eazo-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #78716c;
  box-shadow: 0 4px 12px rgba(22, 28, 40, 0.08);
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}
.eazo-close:hover { color: #292524; background: #ffffff; }

.eazo-header { text-align: center; margin-bottom: 6px; }
.eazo-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: rgba(15, 23, 42, 0.92);
}
.eazo-subtitle {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 500;
  color: rgba(15, 23, 42, 0.52);
}

.eazo-body { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; }

.eazo-provider-btn,
.eazo-email-trigger,
.eazo-secondary-btn {
  width: 100%;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.78);
  color: rgba(15, 23, 42, 0.82);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.09);
  transition: background 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}
.eazo-provider-btn:hover:not(:disabled),
.eazo-secondary-btn:hover:not(:disabled),
.eazo-email-trigger:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}
.eazo-provider-btn:disabled,
.eazo-secondary-btn:disabled,
.eazo-primary-btn:disabled { cursor: not-allowed; opacity: 0.55; }
/* Active loading button keeps full opacity so the spinner reads as the
   in-progress affordance while the rest of the buttons stay dimmed. */
.eazo-provider-btn-loading:disabled { opacity: 1; }

.eazo-provider-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.eazo-primary-btn {
  width: 100%;
  height: 52px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(180deg, #F47A42 0%, #EE5C2A 100%);
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(238, 92, 42, 0.32);
  transition: filter 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}
.eazo-primary-btn:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: 0 14px 30px rgba(238, 92, 42, 0.36);
}

.eazo-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  color: rgba(15, 23, 42, 0.42);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.eazo-divider::before,
.eazo-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(15, 23, 42, 0.1);
}

.eazo-input-wrapper { position: relative; }
.eazo-input {
  width: 100%;
  height: 48px;
  padding: 0 16px 0 44px;
  font: inherit;
  font-size: 15px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.78);
  color: rgba(15, 23, 42, 0.82);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  box-sizing: border-box;
  outline: none;
}
.eazo-input:focus {
  border-color: rgba(238, 92, 42, 0.48);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 4px rgba(238, 92, 42, 0.12);
}
.eazo-input::placeholder { color: rgba(15, 23, 42, 0.4); }

.eazo-input-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  display: inline-flex;
  color: rgba(15, 23, 42, 0.45);
  pointer-events: none;
}
.eazo-input-eye {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: rgba(15, 23, 42, 0.45);
  cursor: pointer;
  padding: 4px;
}
.eazo-input-eye:hover { color: rgba(15, 23, 42, 0.72); }
.eazo-input-code {
  padding-left: 16px;
}

.eazo-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: rgba(15, 23, 42, 0.52);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
}
.eazo-back-btn:hover { color: rgba(15, 23, 42, 0.8); }

.eazo-resend-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.52);
  padding: 0 4px;
}
.eazo-resend-btn {
  border: 0;
  background: transparent;
  color: #EE5C2A;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.eazo-resend-btn:hover:not(:disabled) { color: #d54e1f; }
.eazo-resend-btn:disabled { color: rgba(15, 23, 42, 0.3); cursor: not-allowed; }

.eazo-error {
  background: rgba(248, 113, 113, 0.12);
  color: #b91c1c;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
}

.eazo-spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(15, 23, 42, 0.15);
  border-top-color: rgba(15, 23, 42, 0.65);
  animation: eazo-spin 700ms linear infinite;
}
.eazo-spinner-row { display: flex; justify-content: center; padding: 16px 0; }

@keyframes eazo-spin {
  to { transform: rotate(360deg); }
}

.eazo-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;

export function ensureStylesInjected(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "login-ui");
  style.textContent = LOGIN_UI_CSS;
  document.head.appendChild(style);
}
