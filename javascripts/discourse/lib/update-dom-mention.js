import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";

const cachedNames = new Map();
let pendingSearch;

export async function updateMentionElement(domElement, mention, model) {
  const originalUsername = mention.replace(/^@/, "");
  const username = originalUsername.toLowerCase();
  updateCachedNames(username, model);

  const search = cachedNames.has(username)
    ? Promise.resolve(cachedNames.get(username))
    : searchUsername(username);

  const fullName = await search;

  if (fullName) {
    domElement.dataset.originalMention = mention;
    domElement.innerText = renderMention(fullName, originalUsername);
    domElement.classList.add("mention-fullname");
  }
}

function updateCachedNames(username, model) {
  const mentionedUser = model?.mentioned_users?.find(
    (user) => user.username.toLowerCase() === username,
  );

  if (mentionedUser) {
    cachedNames.set(username, mentionedUser.name);
  }
}

async function searchUsername(username) {
  const pending = pendingSearch;

  if (pending && pending.usernames.size <= 50) {
    //only 50 usernames can be searched at once
    pending.usernames.add(username);
    const results = await pending.search;

    // tests if the search performed included the desired username to prevent  from a possible race condition with
    // the timeout in deferred search
    if (results.searchedUsernames.indexOf(username) > -1) {
      const fullName =
        results.data.users?.find((item) => item.username === username)?.name ||
        results.data.groups?.find((item) => item.name === username)?.full_name;

      cachedNames.set(username, fullName);

      return fullName;
    }
  }

  // in case we can't use the existing the deferred search let's create another one
  return deferSearch(username);
}

async function deferSearch(username) {
  pendingSearch = {
    search: new Promise((resolve) => {
      setTimeout(async () => {
        const searchedUsernames = Array.from(pendingSearch.usernames);
        pendingSearch = null;

        const data = await ajax("/u/search/users.json", {
          data: {
            usernames: searchedUsernames.join(","),
            include_groups: settings.show_fullname_for_groups,
          },
        });

        resolve({ searchedUsernames, data });
      }, 20);
    }),
    usernames: new Set([username]),
  };

  // the call to searchUsername will use the existing pending promise and filter the results
  return await searchUsername(username);
}

function renderMention(name, username) {
  let template = settings.render_template;

  if (settings.render_template?.indexOf("{{name}}") === -1) {
    template = "@{{name}}";
  }

  return template.replace("{{name}}", name).replace("{{username}}", username);
}
