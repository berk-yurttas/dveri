// src/components/ThemeToggle.js
import React from "react";
import "./ThemeToggle.css"; // CSS'i ayrı dosyada tutalım

function ThemeToggle({ isOldTheme, onToggle }) {
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={isOldTheme}
        onChange={onToggle}
      />
      <span className="slider" />
    </label>
  );
}

export default ThemeToggle;
