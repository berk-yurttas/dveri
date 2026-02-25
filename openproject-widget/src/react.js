import React, { useEffect, useRef } from "react";
import { OpenProjectFeedbackWidget } from "./widget.js";

if (!customElements.get("openproject-feedback-widget")) {
  customElements.define("openproject-feedback-widget", OpenProjectFeedbackWidget);
}

export function OpenProjectFeedbackWidgetReact({
  submitUrl,
  uploadUrl,
  backendBaseUrl,
  title,
  subtitle,
  platformOptions,
  defaultPlatform,
  defaultOwner,
  defaultBirim,
  openprojectUrl,
  openprojectApiToken,
  openprojectProjectId,
  openprojectColumnQueryId,
  openprojectPlatformCustomFieldId,
  openprojectTalepSahibiCustomFieldId,
  openprojectBirimCustomFieldId,
  openprojectTypeId,
  openprojectVerifySsl,
  onClose,
  onCancel,
  onSuccess,
  onError
} = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const handleSuccess = (event) => onSuccess && onSuccess(event.detail);
    const handleError = (event) => onError && onError(event.detail);
    const handleClose = (event) => onClose && onClose(event.detail);
    const handleCancel = (event) => onCancel && onCancel(event.detail);

    el.addEventListener("opw-success", handleSuccess);
    el.addEventListener("opw-error", handleError);
    el.addEventListener("opw-close", handleClose);
    el.addEventListener("opw-cancel", handleCancel);
    return () => {
      el.removeEventListener("opw-success", handleSuccess);
      el.removeEventListener("opw-error", handleError);
      el.removeEventListener("opw-close", handleClose);
      el.removeEventListener("opw-cancel", handleCancel);
    };
  }, [onSuccess, onError, onClose, onCancel]);

  return React.createElement("openproject-feedback-widget", {
    ref,
    "submit-url": submitUrl,
    "upload-url": uploadUrl,
    "backend-base-url": backendBaseUrl,
    title,
    subtitle,
    "platform-options": platformOptions,
    "default-platform": defaultPlatform,
    "default-owner": defaultOwner,
    "default-birim": defaultBirim,
    "openproject-url": openprojectUrl,
    "openproject-api-token": openprojectApiToken,
    "openproject-project-id": openprojectProjectId,
    "openproject-column-query-id": openprojectColumnQueryId,
    "openproject-platform-custom-field-id": openprojectPlatformCustomFieldId,
    "openproject-talep-sahibi-custom-field-id": openprojectTalepSahibiCustomFieldId,
    "openproject-birim-custom-field-id": openprojectBirimCustomFieldId,
    "openproject-type-id": openprojectTypeId,
    "openproject-verify-ssl": openprojectVerifySsl
  });
}


