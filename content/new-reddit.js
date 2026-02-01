// content/new-reddit.js - Handler for New Reddit (www.reddit.com)

function filterNewRedditPosts(containsKeyword) {
  let blockedCount = 0;

  // New Reddit uses shreddit-post custom elements (2024+ redesign)
  const shredditPosts = document.querySelectorAll('shreddit-post:not([data-filtered])');

  shredditPosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    // Get title from slot or attribute
    const titleSlot = post.querySelector('[slot="title"]');
    const title = titleSlot?.textContent ||
                  post.getAttribute('post-title') ||
                  '';

    if (containsKeyword(title)) {
      hideNewRedditPost(post);
      blockedCount++;
    }
  });

  // Handle older new Reddit structure (data-testid approach)
  const testIdPosts = document.querySelectorAll(
    '[data-testid="post-container"]:not([data-filtered])'
  );

  testIdPosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    // Title usually in h3 or specific data-testid
    const titleElement = post.querySelector('h3, [data-testid="post-title"]');
    const title = titleElement?.textContent || '';

    if (containsKeyword(title)) {
      hideNewRedditPost(post);
      blockedCount++;
    }
  });

  // Handle article-based posts (another variation)
  const articlePosts = document.querySelectorAll(
    'article:not([data-filtered])'
  );

  articlePosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    const titleElement = post.querySelector('h3, [slot="title"], a[href*="/comments/"]');
    const title = titleElement?.textContent || '';

    if (containsKeyword(title)) {
      hideNewRedditPost(post);
      blockedCount++;
    }
  });

  return blockedCount;
}

function hideNewRedditPost(post) {
  // Find the parent container to hide (varies by Reddit version)
  let container = post;

  // Walk up to find the full post container
  while (container.parentElement &&
         !container.parentElement.matches('main, #main-content, body, [data-scroller-first]')) {
    const parent = container.parentElement;
    // Stop if we've found a good container boundary
    if (container.matches('shreddit-post, article, [data-testid="post-container"]')) {
      break;
    }
    // Check if parent is a direct wrapper we should hide instead
    if (parent.children.length === 1) {
      container = parent;
    } else {
      break;
    }
  }

  container.style.display = 'none';
}
