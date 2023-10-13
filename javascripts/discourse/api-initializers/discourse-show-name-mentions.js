import { bind } from "discourse-common/utils/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import { addTextDecorateCallback } from "discourse/lib/to-markdown";
import { updateMentionElement } from "../lib/update-dom-mention";

export default {
  name: "discourse-show-name-mentions",

  initialize(container) {
    const siteSettings = container.lookup("service:site-settings");

    if (!settings.show_fullname_in_mentions || !siteSettings.enable_names) {
      return;
    }

    withPluginApi("0.8", (api) => {
      updateCookedMentions(api);
      patchCardComponents(api);
      addConversionToMarkdown();
    });
  },
};

function updateCookedMentions(api) {
  api.decorateCookedElement((element, helper) => {
    const selector = settings.show_fullname_for_groups
      ? "a.mention,a.mention-group"
      : "a.mention";
    const mentions = element.querySelectorAll(selector);

    mentions.forEach((domElement) => {
      if (domElement.dataset.originalMention) {
        // the element is already changed
        return;
      }

      const username = domElement.innerText;
      updateMentionElement(domElement, username, helper?.getModel());
    });
  });
}

function patchCardComponents(api) {
  const cardComponents = ["component:user-card-contents"];
  if (settings.show_fullname_for_groups) {
    cardComponents.push("component:group-card-contents");
  }

  cardComponents.forEach((component) => {
    api.modifyClass(component, {
      pluginId: "show-named-mentions",

      @bind
      _cardClickHandler(event) {
        // I'd like to test for the data attribute to to call this._showCardOnClick with
        // the correct username or else call this._super but could not find a way to make
        // it work because this method is inherited from a mixin, so I adapted the method from
        // https://github.com/discourse/discourse/blob/main/app/assets/javascripts/discourse/app/mixins/card-contents-base.js#L132

        if (this.avatarSelector) {
          let matched = this._showCardOnClick(
            event,
            this.avatarSelector,
            (el) => el.dataset[this.avatarDataAttrKey],
          );

          if (matched) {
            return; // Don't need to check for mention click; it's an avatar click
          }
        }

        // Mention click
        this._showCardOnClick(event, this.mentionSelector, (el) => {
          // return the username data attribute if present or else fallback to the
          // default innerText
          const username = el.dataset.originalMention || el.innerText;
          return username.replace(/^@/, "");
        });
      },
    });
  });
}

function addConversionToMarkdown() {
  addTextDecorateCallback(function () {
    if (
      this?.parent?.attributes?.class?.includes(
        "discourse-show-name-mentions",
      ) &&
      this?.parent?.attributes?.["data-original-mention"]
    ) {
      return this.parent.attributes["data-original-mention"];
    }
  });
}
