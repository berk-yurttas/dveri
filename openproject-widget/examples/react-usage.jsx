import React from "react";
import { OpenProjectFeedbackWidgetReact } from "../src/react.js";

export default function Example() {
  return (
    <div style={{ padding: 24, background: "#f8fafc" }}>
      <OpenProjectFeedbackWidgetReact
        backendBaseUrl="http://localhost:8787"
        title="Geri Bildirim Gönder"
        subtitle="Talep ve Öneri Bildirimi"
        platformOptions="DerinİZ,İVME,rom-IoT,a-MOM"
        defaultPlatform="DerinİZ"
        defaultOwner="konurozkan"
        defaultBirim="IT"
        openprojectUrl="http://localhost:8080"
        openprojectApiToken="your_token_here"
        openprojectProjectId={3}
        openprojectColumnQueryId={30}
        openprojectPlatformCustomFieldId={2}
        openprojectTalepSahibiCustomFieldId={3}
        openprojectBirimCustomFieldId={4}
        openprojectTypeId={1}
        openprojectVerifySsl={false}
        onSuccess={(data) => console.log("Created:", data)}
        onError={(err) => console.error("Failed:", err)}
      />
    </div>
  );
}


