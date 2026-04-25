const STYLE_ID = "eazo-sdk-share-ui";

export const SHARE_UI_CSS = `
.eazo-share-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: eazo-share-fade-in 180ms ease-out;
}

.eazo-share-content {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 2147483601;
  width: calc(100vw - 32px);
  max-width: 380px;
  transform: translate(-50%, -50%);
  border-radius: 24px;
  padding: 28px 24px 22px;
  background: linear-gradient(145deg, #ffffff 0%, #f8f6f3 100%);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.8);
  color: #0f172a;
  font-family: inherit;
  animation: eazo-share-pop-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  text-align: center;
}

@keyframes eazo-share-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes eazo-share-pop-in {
  from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.eazo-share-close {
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
.eazo-share-close:hover { color: #292524; background: #ffffff; }

.eazo-share-icon-frame {
  width: 56px;
  height: 56px;
  margin: 4px auto 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(244, 122, 66, 0.18) 0%, rgba(238, 92, 42, 0.08) 100%);
  color: #EE5C2A;
}

.eazo-share-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: rgba(15, 23, 42, 0.92);
}
.eazo-share-subtitle {
  margin: 8px 4px 22px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: rgba(15, 23, 42, 0.58);
}

.eazo-share-cta {
  display: inline-flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(180deg, #F47A42 0%, #EE5C2A 100%);
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(238, 92, 42, 0.32);
  transition: filter 160ms ease, box-shadow 160ms ease;
}
.eazo-share-cta:hover {
  filter: brightness(1.05);
  box-shadow: 0 14px 30px rgba(238, 92, 42, 0.36);
}

.eazo-share-secondary {
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: rgba(15, 23, 42, 0.52);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 8px 12px;
}
.eazo-share-secondary:hover { color: rgba(15, 23, 42, 0.78); }
`;

export function ensureShareStylesInjected(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "share-ui");
  style.textContent = SHARE_UI_CSS;
  document.head.appendChild(style);
}
