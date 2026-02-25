"use client";

import React, { useEffect, useRef, useState } from "react";

export interface OpenProjectFeedbackWidgetReactProps {
  submitUrl?: string;
  uploadUrl?: string;
  backendBaseUrl?: string;
  title?: string;
  subtitle?: string;
  platformOptions?: string;
  defaultPlatform?: string;
  defaultOwner?: string;
  defaultBirim?: string;
  openprojectUrl?: string;
  openprojectApiToken?: string;
  openprojectProjectId?: number;
  openprojectColumnQueryId?: number;
  openprojectPlatformCustomFieldId?: number;
  openprojectTalepSahibiCustomFieldId?: number;
  openprojectBirimCustomFieldId?: number;
  openprojectTypeId?: number;
  openprojectVerifySsl?: boolean;
  onSuccess?: (detail: unknown) => void;
  onError?: (detail: { message: string }) => void;
  onClose?: () => void;
  onCancel?: () => void;
}

export function OpenProjectFeedbackWidgetReact(props: OpenProjectFeedbackWidgetReactProps) {
  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  // Dynamically import & register the Web Component (client-only, avoids SSR crash)
  useEffect(() => {
    import("./openproject-widget").then(({ OpenProjectFeedbackWidget }) => {
      if (!customElements.get("openproject-feedback-widget")) {
        customElements.define("openproject-feedback-widget", OpenProjectFeedbackWidget);
      }
      setReady(true);
    });
  }, []);

  // Wire up custom-element events → React callbacks
  useEffect(() => {
    if (!ready) return;
    const el = ref.current;
    if (!el) return;

    const handleSuccess = (e: Event) => props.onSuccess?.((e as CustomEvent).detail);
    const handleError = (e: Event) => props.onError?.((e as CustomEvent).detail);
    const handleClose = () => props.onClose?.();
    const handleCancel = () => props.onCancel?.();

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
  }, [ready, props.onSuccess, props.onError, props.onClose, props.onCancel]);

  if (!ready) return null;

  return React.createElement("openproject-feedback-widget", {
    ref,
    "submit-url": props.submitUrl,
    "upload-url": props.uploadUrl,
    "backend-base-url": props.backendBaseUrl,
    title: props.title,
    subtitle: props.subtitle,
    "platform-options": props.platformOptions,
    "default-platform": props.defaultPlatform,
    "default-owner": props.defaultOwner,
    "default-birim": props.defaultBirim,
    "openproject-url": props.openprojectUrl,
    "openproject-api-token": props.openprojectApiToken,
    "openproject-project-id": props.openprojectProjectId,
    "openproject-column-query-id": props.openprojectColumnQueryId,
    "openproject-platform-custom-field-id": props.openprojectPlatformCustomFieldId,
    "openproject-talep-sahibi-custom-field-id": props.openprojectTalepSahibiCustomFieldId,
    "openproject-birim-custom-field-id": props.openprojectBirimCustomFieldId,
    "openproject-type-id": props.openprojectTypeId,
    "openproject-verify-ssl": props.openprojectVerifySsl,
  });
}

