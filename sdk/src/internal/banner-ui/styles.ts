const STYLE_ID = "eazo-sdk-banner-ui";

export const BANNER_HEIGHT_DESKTOP = 52;
export const BANNER_HEIGHT_MOBILE = 64;

export const BANNER_UI_CSS = `
.eazo-banner-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483550;
  display: flex;
  align-items: center;
  gap: 12px;
  height: ${BANNER_HEIGHT_DESKTOP}px;
  padding: 0 14px 0 18px;
  background: #f1ebe0;
  color: #11130f;
  font-family: inherit;
  box-sizing: border-box;
  animation: eazo-banner-slide-down 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes eazo-banner-slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.eazo-banner-brand {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: #11130f;
}

.eazo-banner-copy {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(17, 19, 15, 0.62);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eazo-banner-cta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 12px;
  background: #d4614a;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: filter 160ms ease, box-shadow 160ms ease;
}
.eazo-banner-cta:hover {
  filter: brightness(1.06);
  box-shadow: 0 8px 18px rgba(212, 97, 74, 0.36);
}

@media (max-width: 480px) {
  .eazo-banner-root {
    height: ${BANNER_HEIGHT_MOBILE}px;
    padding: 0 10px 0 14px;
    gap: 10px;
  }
  .eazo-banner-copy {
    font-size: 12px;
    line-height: 1.25;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .eazo-banner-cta {
    height: 32px;
    padding: 0 12px;
    font-size: 12px;
  }
}
`;

export function ensureBannerStylesInjected(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "banner-ui");
  style.textContent = BANNER_UI_CSS;
  document.head.appendChild(style);
}
