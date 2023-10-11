import {bind} from "discourse-common/utils/decorators";
import {ajax} from "discourse/lib/ajax";
import {apiInitializer} from "discourse/lib/api";

const cachedNames = new Map();
let pendingSearch;

async function deferSearch(username) {
  pendingSearch = {
    search: new Promise((resolve) => {
      setTimeout(async () => {
        const searchedUsernames = Array.from(pendingSearch.usernames);
        pendingSearch = null;

        const data = await ajax("/u/search/users.json", {
          data: {usernames: searchedUsernames.join(","), include_groups: settings.show_fullname_for_groups},
        });

        resolve({searchedUsernames, data});
      }, 20);
    }), usernames: new Set([username])
  }

  // the call to searchUsername will use the existing pending promise and filter the results
  return await searchUsername(username);
}

async function searchUsername(username) {
  const pending = pendingSearch;

  if (pending && pending.usernames.size <= 50) { //only 50 usernames can be searched at once
    pending.usernames.add(username);
    const results = await pending.search;

    // tests if the search performed included the desired username to prevent  from a possible race condition with
    // the timeout in deferred search
    if (results.searchedUsernames.indexOf(username) > -1) {
      const fullName = results.data.users?.find(item => item.username === username)?.name
        || results.data.groups?.find(item => item.name === username)?.full_name;

      cachedNames.set(username, fullName);

      return fullName;
    }
  }

  // in case we can't use the existing the deferred search let's create another one
  return deferSearch(username);
}

function updateCachedNames(username, model) {
  const user = model?.mentioned_users?.find(user => user.username.toLowerCase() === username);

  if (user) {
    cachedNames.set(username, user.name)
  }
}

async function updateMention(domNode, mention, model) {
  const username = mention.toLowerCase().replace(/^@/, "")
  updateCachedNames(username, model);

  const search = cachedNames.has(username)
    ? Promise.resolve(cachedNames.get(username))
    : searchUsername(username);

  const fullName = await search;
  console.log(username, fullName)

  if (fullName) {
    domNode.dataset.originalMention = username;
    domNode.innerText = `@${fullName}`;
    domNode.classList.add("mention-fullname");
  }
}

export default apiInitializer("0.8", (api) => {
  if (!settings.show_fullname_in_mentions) return;

  api.decorateCookedElement((element, helper) => {
    const selector = settings.show_fullname_for_groups ? "a.mention,a.mention-group" : "a.mention";
    const mentions = element.querySelectorAll(selector);

    mentions.forEach((domNode) => {
      if (domNode.dataset.originalMention) {
        // the element is already changed
        return;
      }

      const username = domNode.innerText;
      updateMention(domNode, username, helper?.getModel());
    });
  }, {
    id: "show-named-mentions",
  });

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
          let matched = this._showCardOnClick(event, this.avatarSelector, (el) => el.dataset[this.avatarDataAttrKey]);

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
});
