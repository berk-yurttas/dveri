import { OpenProjectFeedbackWidget } from "./widget.js";

export function registerOpenProjectFeedbackWidget(tagName = "openproject-feedback-widget") {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, OpenProjectFeedbackWidget);
  }
  return tagName;
}

registerOpenProjectFeedbackWidget();

export { OpenProjectFeedbackWidget };
export { OpenProjectFeedbackWidgetReact } from "./react.js";


