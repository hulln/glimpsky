const APP_API_BASES = [
    'https://public.api.bsky.app/xrpc',
    'https://bsky.social/xrpc'
];
const DEFAULT_PAGE_TITLE = 'GlimpSky Thread Viewer - Full Bluesky Thread Tree';
const THEME_STORAGE_KEY = 'glimpsky-theme';
const THREAD_FETCH_ATTEMPTS = [
    { depth: 1000, parentHeight: 1000 },
    { depth: 400, parentHeight: 400 },
    { depth: 200, parentHeight: 200 },
    { depth: 100, parentHeight: 80 }
];
const THREAD_CHILD_FETCH_ATTEMPTS = [
    { depth: 1000, parentHeight: 0 },
    { depth: 400, parentHeight: 0 },
    { depth: 200, parentHeight: 0 },
    { depth: 100, parentHeight: 0 }
];
const THREAD_VIEW_POST = 'app.bsky.feed.defs#threadViewPost';
const BLOCKED_POST = 'app.bsky.feed.defs#blockedPost';
const NOT_FOUND_POST = 'app.bsky.feed.defs#notFoundPost';
const RECOVERY_APPVIEW = 'appview';
const RECOVERY_PDS = 'pds';
const FETCH_TIMEOUT_MS = 12000;
const MAX_THREAD_EXPANSION_FETCHES = 80;
const MAX_DISCOVERED_THREAD_NODES = 500;
const DEFAULT_AVATAR_SRC = '/assets/default-avatar.svg';
const DEFAULT_AVATAR_ONERROR = `this.onerror=null;this.src='${DEFAULT_AVATAR_SRC}'`;

let currentInputValue = '';
let currentThreadUri = '';
let currentRootUri = '';
let currentExpansionMeta = null;
let currentThreadData = null;
let isLoading = false;
let activeLoadToken = 0;
const recoveryCache = new Map();
const profileCache = new Map();
const didDocumentCache = new Map();
const pdsUrlCache = new Map();

const elements = {
    threadInput: document.getElementById('threadInput'),
    loadThreadBtn: document.getElementById('loadThreadBtn'),
    copyShareBtn: document.getElementById('copyShareBtn'),
    infoBtn: document.getElementById('infoBtn'),
    infoModal: document.getElementById('infoModal'),
    infoModalClose: document.getElementById('infoModalClose'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    threadViewerReset: document.getElementById('threadViewerReset'),
    error: document.getElementById('error'),
    threadStatus: document.getElementById('threadStatus'),
    threadResults: document.getElementById('threadResults'),
    threadContent: document.getElementById('threadContent')
};

initTheme();
bindEvents();
restoreThreadFromQuery();
toggleClearButton(elements.threadInput);
setStatus('Ready');

function bindEvents() {
    elements.loadThreadBtn.addEventListener('click', () => {
        void loadThreadFromInput(elements.threadInput.value);
    });
    elements.copyShareBtn.addEventListener('click', () => {
        void copyShareLink();
    });
    if (elements.infoBtn && elements.infoModal) {
        elements.infoBtn.addEventListener('click', () => {
            elements.infoModal.classList.add('open');
            elements.infoModal.setAttribute('aria-hidden', 'false');
        });
    }
    if (elements.infoModalClose && elements.infoModal) {
        elements.infoModalClose.addEventListener('click', () => {
            closeInfoModal();
        });
    }
    if (elements.threadViewerReset) {
        elements.threadViewerReset.addEventListener('click', () => {
            resetThreadViewer();
        });
        elements.threadViewerReset.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                resetThreadViewer();
            }
        });
    }
    elements.threadInput.addEventListener('input', () => {
        toggleClearButton(elements.threadInput);
    });
    elements.threadInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            void loadThreadFromInput(elements.threadInput.value);
        }
    });
    document.querySelectorAll('.clear-input').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-clear-target');
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;
            input.value = '';
            toggleClearButton(input);
            if (input === elements.threadInput) {
                input.focus();
            }
        });
    });
    elements.threadContent.addEventListener('click', (event) => {
        const copyButton = event.target.closest('[data-copy-post-url]');
        if (copyButton) {
            event.preventDefault();
            const url = copyButton.getAttribute('data-copy-post-url') || '';
            if (url) {
                void copyText(url, copyButton);
            }
        }
    });
    if (elements.infoModal) {
        elements.infoModal.addEventListener('click', (event) => {
            if (event.target === elements.infoModal) {
                closeInfoModal();
            }
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && elements.infoModal && elements.infoModal.classList.contains('open')) {
            closeInfoModal();
        }
    });
}

function closeInfoModal() {
    if (!elements.infoModal) return;
    elements.infoModal.classList.remove('open');
    elements.infoModal.setAttribute('aria-hidden', 'true');
}

function getStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored === 'dark' || stored === 'light' ? stored : null;
    } catch (error) {
        return null;
    }
}

function getPreferredTheme() {
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, persist = true) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (elements.themeToggleBtn) {
        const showMoon = nextTheme !== 'dark';
        elements.themeToggleBtn.classList.toggle('is-dark', nextTheme === 'dark');
        elements.themeToggleBtn.setAttribute('aria-label', showMoon ? 'Switch to dark mode' : 'Switch to light mode');
        elements.themeToggleBtn.setAttribute('aria-pressed', nextTheme === 'dark' ? 'true' : 'false');
    }
    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (error) {
            // ignore storage failures
        }
    }
}

function initTheme() {
    applyTheme(getPreferredTheme(), false);
    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
}

function toggleClearButton(input) {
    if (!input) return;
    const wrapper = input.parentElement;
    const button = wrapper ? wrapper.querySelector('.clear-input') : null;
    if (!button) return;
    button.classList.toggle('show', Boolean(input.value && input.value.trim()));
}

function getAvatarUrl(avatar) {
    return typeof avatar === 'string' && avatar.trim() ? avatar.trim() : DEFAULT_AVATAR_SRC;
}

function renderAvatarImg(src, alt, className) {
    return `<img class="${escapeHtml(className || '')}" src="${escapeHtml(getAvatarUrl(src))}" alt="${escapeHtml(alt || '')}" onerror="${DEFAULT_AVATAR_ONERROR}">`;
}

function restoreThreadFromQuery() {
    try {
        const params = new URLSearchParams(window.location.search);
        const input = params.get('url') || params.get('uri') || '';
        if (!input) return;
        elements.threadInput.value = input;
        toggleClearButton(elements.threadInput);
        void loadThreadFromInput(input, { preserveInput: true });
    } catch (error) {
        // ignore URL parsing failures
    }
}

function setLoading(loading) {
    isLoading = Boolean(loading);
    elements.loadThreadBtn.disabled = isLoading;
    elements.copyShareBtn.disabled = false;
    elements.threadInput.disabled = isLoading;
}

function setStatus(message, tone = 'neutral') {
    if (!elements.threadStatus) return;
    const nextTone = tone === 'loading' || tone === 'success' || tone === 'error' ? tone : 'neutral';
    elements.threadStatus.textContent = message || '';
    elements.threadStatus.classList.remove('is-loading', 'is-success', 'is-error');
    if (nextTone === 'loading') elements.threadStatus.classList.add('is-loading');
    if (nextTone === 'success') elements.threadStatus.classList.add('is-success');
    if (nextTone === 'error') elements.threadStatus.classList.add('is-error');
}

function showError(message) {
    elements.error.innerHTML = message
        ? `<div class="error">${escapeHtml(message)}</div>`
        : '';
    if (message) {
        setStatus(message, 'error');
    }
}

function showLoading() {
    elements.threadContent.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading thread...</p>
        </div>
    `;
}

function renderEmptyThreadState() {
    return `
        <div class="empty-state thread-empty-state">
            <p>Paste a Bluesky post URL and load the thread.</p>
            <p class="thread-empty-help">If a thread contains block-related gaps, this page will render the placeholders instead of stopping at “can’t find parent post”.</p>
        </div>
    `;
}

function resetThreadViewer() {
    activeLoadToken += 1;
    currentInputValue = '';
    currentThreadUri = '';
    currentRootUri = '';
    currentExpansionMeta = null;
    currentThreadData = null;
    elements.threadInput.value = '';
    toggleClearButton(elements.threadInput);
    setLoading(false);
    showError('');
    setStatus('Ready');
    elements.threadContent.innerHTML = renderEmptyThreadState();
    updateLocationQuery('');
    document.title = DEFAULT_PAGE_TITLE;
    elements.threadInput.focus();
}

async function loadThreadFromInput(rawInput, options = {}) {
    const trimmed = String(rawInput || '').trim();
    if (!trimmed) {
        showError('');
        setStatus('Paste a Bluesky post URL or AT-URI first.', 'error');
        elements.threadInput.focus();
        return;
    }
    if (isLoading) return;
    const loadToken = ++activeLoadToken;

    setLoading(true);
    showError('');
    showLoading();
    currentExpansionMeta = null;
    setStatus('Preparing thread request...', 'loading');

    try {
        setStatus('Resolving thread reference...', 'loading');
        const parsed = await parseThreadReference(trimmed);
        setStatus('Loading and expanding the thread tree from Bluesky...', 'loading');
        const expansion = await fetchExpandedThread(parsed.uri, {
            onProgress: (message) => {
                if (loadToken !== activeLoadToken) return;
                setStatus(message, 'loading');
            }
        });
        if (loadToken !== activeLoadToken) return;

        currentInputValue = trimmed;
        currentThreadUri = parsed.uri;
        currentRootUri = expansion.rootUri || parsed.uri;
        currentExpansionMeta = expansion.meta;
        currentThreadData = {
            thread: expansion.thread
        };

        renderThread(expansion.thread, { ...parsed, rootUri: currentRootUri });
        updateLocationQuery(options.preserveInput ? trimmed : parsed.shareValue || trimmed);
        setLoading(false);
        const preRecoveryMessage = expansion.meta && expansion.meta.fetches > 1
            ? `Expanded thread across ${formatNumber(expansion.meta.fetches)} post fetches. Recovering hidden public posts...`
            : 'Thread loaded. Recovering hidden public posts...';
        setStatus(preRecoveryMessage, 'loading');

        try {
            const hydratedThread = await hydrateThreadNodes(expansion.thread, { includeParent: true });
            if (loadToken !== activeLoadToken) return;
            currentThreadData = {
                thread: hydratedThread
            };
            renderThread(hydratedThread, { ...parsed, rootUri: currentRootUri });
            const stats = collectThreadStats(hydratedThread);
            const unresolvedSuffix = currentExpansionMeta && currentExpansionMeta.unresolvedReplyCount > 0
                ? ` ${formatNumber(currentExpansionMeta.unresolvedReplyCount)} reported repl${currentExpansionMeta.unresolvedReplyCount === 1 ? 'y still is' : 'ies still are'} not reachable from public thread calls.`
                : '';
            if (stats.recovered > 0) {
                setStatus(`Loaded expanded thread and recovered ${stats.recovered} hidden public post${stats.recovered === 1 ? '' : 's'}.${unresolvedSuffix}`, 'success');
            } else {
                setStatus(`Loaded expanded thread. No additional hidden public posts were recovered.${unresolvedSuffix}`, 'success');
            }
        } catch (hydrationError) {
            if (loadToken !== activeLoadToken) return;
            showError(`Thread loaded, but recovery did not complete: ${hydrationError.message || 'unknown error'}`);
        }
    } catch (error) {
        if (loadToken !== activeLoadToken) return;
        currentThreadData = null;
        currentThreadUri = '';
        currentRootUri = '';
        currentExpansionMeta = null;
        elements.threadContent.innerHTML = `
            <div class="empty-state thread-empty-state">
                <p>Could not load this thread.</p>
                <p class="thread-empty-help">${escapeHtml(error.message || 'Unknown error.')}</p>
            </div>
        `;
        showError('');
        setStatus(error.message || 'Could not load thread.', 'error');
    } finally {
        if (loadToken === activeLoadToken && isLoading) {
            setLoading(false);
        }
    }
}

async function parseThreadReference(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) {
        throw new Error('Missing thread reference.');
    }

    if (raw.startsWith('at://')) {
        validateAtUri(raw);
        return {
            uri: raw,
            shareValue: raw
        };
    }

    if (/^did:[^/\s]+\/app\.bsky\.feed\.post\/[^/\s?#]+$/i.test(raw)) {
        const uri = `at://${raw}`;
        validateAtUri(uri);
        return {
            uri,
            shareValue: raw
        };
    }

    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsedUrl;
    try {
        parsedUrl = new URL(withProtocol);
    } catch (error) {
        throw new Error('Could not parse that input. Paste a full Bluesky post URL or AT-URI.');
    }

    const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.endsWith('bsky.app')) {
        throw new Error('This viewer currently accepts Bluesky post URLs from bsky.app or AT-URIs.');
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length < 4 || segments[0] !== 'profile' || segments[2] !== 'post') {
        throw new Error('Expected a URL like bsky.app/profile/handle/post/postid.');
    }

    const actor = decodeURIComponent(segments[1] || '');
    const rkey = decodeURIComponent(segments[3] || '');
    if (!actor || !rkey) {
        throw new Error('Could not extract the actor and post id from that URL.');
    }

    const did = actor.startsWith('did:') ? actor : await resolveHandle(actor);
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    validateAtUri(uri);
    return {
        uri,
        shareValue: raw
    };
}

function validateAtUri(uri) {
    const isValid = /^at:\/\/did:[^/]+\/app\.bsky\.feed\.post\/[^/\s?#]+$/i.test(uri);
    if (!isValid) {
        throw new Error('Unsupported AT-URI. Expected at://did:.../app.bsky.feed.post/...');
    }
}

async function resolveHandle(handle) {
    const normalized = String(handle || '')
        .trim()
        .replace(/^@/, '')
        .replace(/^https?:\/\//i, '')
        .replace(/^bsky\.app\/profile\//i, '');

    if (!normalized) {
        throw new Error('Missing handle.');
    }

    const data = await fetchJsonFromAppApi('com.atproto.identity.resolveHandle', { handle: normalized });
    if (!data || !data.did) {
        throw new Error(`No DID returned for handle: ${normalized}`);
    }
    return data.did;
}

async function fetchThreadView(uri, options = {}) {
    const includeParents = Boolean(options.includeParents);
    const attempts = includeParents ? THREAD_FETCH_ATTEMPTS : THREAD_CHILD_FETCH_ATTEMPTS;
    let lastError = null;

    for (const limits of attempts) {
        try {
            const data = await fetchJsonFromAppApi('app.bsky.feed.getPostThread', {
                uri,
                depth: String(limits.depth),
                parentHeight: String(limits.parentHeight)
            });
            if (!data || !data.thread) {
                throw new Error('The Bluesky API returned an empty thread payload.');
            }

            return { data, limits };
        } catch (error) {
            lastError = error;
            if (error && error.status === 400) {
                continue;
            }
            if (!(error instanceof TypeError) && !String(error.message || '').includes('Failed to fetch')) {
                throw error;
            }
        }
    }

    throw lastError || new Error('Could not load thread.');
}

async function fetchExpandedThread(anchorUri, options = {}) {
    const onProgress = typeof options.onProgress === 'function'
        ? options.onProgress
        : () => {};

    const mergedNodes = new Map();
    const fetchQueue = [];
    const queuedUris = new Set();
    const fetchedUris = new Set();

    onProgress('Loading thread context from the selected post...');
    const anchorResult = await fetchThreadView(anchorUri, { includeParents: true });
    fetchedUris.add(anchorUri);
    mergeFetchedThread(anchorResult.data.thread, mergedNodes);
    let recoveredUris = await recoverMergedPlaceholders(mergedNodes);

    const rootUri = getRootUriFromThread(anchorResult.data.thread, anchorUri) || anchorUri;
    ensureMergedNode(mergedNodes, rootUri);

    let fetchCount = 1;
    let lastFetchLimits = anchorResult.limits;

    if (rootUri && rootUri !== anchorUri) {
        enqueueThreadFetch(fetchQueue, queuedUris, fetchedUris, rootUri);
    }
    queueExpandablePosts(mergedNodes, fetchQueue, queuedUris, fetchedUris, rootUri);
    queueRecoveredExpansionTargets(mergedNodes, recoveredUris, fetchQueue, queuedUris, fetchedUris, rootUri);

    while (fetchQueue.length && fetchCount < MAX_THREAD_EXPANSION_FETCHES && mergedNodes.size < MAX_DISCOVERED_THREAD_NODES) {
        const nextUri = fetchQueue.shift();
        queuedUris.delete(nextUri);
        if (!nextUri || fetchedUris.has(nextUri)) continue;

        onProgress(`Expanding whole thread (${formatNumber(fetchCount)} fetch${fetchCount === 1 ? '' : 'es'}, ${formatNumber(mergedNodes.size)} posts/gaps discovered)...`);

        let result;
        try {
            result = await fetchThreadView(nextUri, {
                includeParents: nextUri === rootUri
            });
        } catch (error) {
            if (nextUri === rootUri) {
                throw error;
            }
            continue;
        }
        fetchedUris.add(nextUri);
        fetchCount += 1;
        lastFetchLimits = result.limits;
        mergeFetchedThread(result.data.thread, mergedNodes);
        recoveredUris = await recoverMergedPlaceholders(mergedNodes);
        queueExpandablePosts(mergedNodes, fetchQueue, queuedUris, fetchedUris, rootUri);
        queueRecoveredExpansionTargets(mergedNodes, recoveredUris, fetchQueue, queuedUris, fetchedUris, rootUri);
    }

    const truncated = fetchQueue.length > 0 || mergedNodes.size >= MAX_DISCOVERED_THREAD_NODES;
    const thread = buildMergedThreadTree(mergedNodes, rootUri, anchorUri);
    if (!thread) {
        throw new Error('Could not build a rooted thread tree from the public replies.');
    }

    return {
        thread,
        rootUri,
        meta: buildExpansionMeta(mergedNodes, fetchedUris, {
            anchorUri,
            rootUri,
            truncated,
            queued: fetchQueue.length,
            lastFetchLimits
        })
    };
}

async function readErrorMessage(response) {
    try {
        const data = await response.json();
        if (data && typeof data.message === 'string' && data.message.trim()) {
            return data.message.trim();
        }
        if (data && typeof data.error === 'string' && data.error.trim()) {
            return data.error.trim();
        }
        return '';
    } catch (error) {
        return '';
    }
}

async function hydrateThreadNodes(node, options = {}) {
    if (!node || typeof node !== 'object') return node;
    const includeParent = Boolean(options.includeParent);

    const type = getThreadNodeType(node);
    if ((type === BLOCKED_POST || type === NOT_FOUND_POST) && node.uri) {
        const recoveredNode = await recoverPlaceholderNode(node, { includeParent });
        if (recoveredNode) {
            if (includeParent && node.parent) {
                recoveredNode.parent = await hydrateThreadNodes(node.parent, { includeParent: true });
            }
            if (Array.isArray(node.replies) && node.replies.length) {
                recoveredNode.replies = await Promise.all(
                    node.replies.map((reply) => hydrateThreadNodes(reply, { includeParent: false }))
                );
            }
            return recoveredNode;
        }
    }

    if (type === THREAD_VIEW_POST) {
        const hydrated = {
            ...node,
            post: await hydratePostEmbeds(node.post || null)
        };
        if (includeParent && node.parent) {
            hydrated.parent = await hydrateThreadNodes(node.parent, { includeParent: true });
        }
        if (Array.isArray(node.replies) && node.replies.length) {
            hydrated.replies = await Promise.all(
                node.replies.map((reply) => hydrateThreadNodes(reply, { includeParent: false }))
            );
        }
        return hydrated;
    }

    const fallback = { ...node };
    if (includeParent && node.parent) {
        fallback.parent = await hydrateThreadNodes(node.parent, { includeParent: true });
    }
    if (Array.isArray(node.replies) && node.replies.length) {
        fallback.replies = await Promise.all(
            node.replies.map((reply) => hydrateThreadNodes(reply, { includeParent: false }))
        );
    }
    return fallback;
}

async function hydratePostEmbeds(post) {
    if (!post || typeof post !== 'object') return post;
    if (!post.embed || typeof post.embed !== 'object') return post;

    const hydratedEmbed = await hydrateEmbedView(post.embed);
    if (hydratedEmbed === post.embed) return post;
    return {
        ...post,
        embed: hydratedEmbed
    };
}

async function hydrateEmbedView(embed) {
    if (!embed || typeof embed !== 'object') return embed;

    if (embed.$type === 'app.bsky.embed.record#view') {
        const hydratedRecord = await hydrateRecordView(embed.record);
        if (hydratedRecord === embed.record) return embed;
        return {
            ...embed,
            record: hydratedRecord
        };
    }

    if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
        const [hydratedMedia, hydratedRecord] = await Promise.all([
            embed.media ? hydrateEmbedView(embed.media) : Promise.resolve(embed.media),
            embed.record ? hydrateRecordView(embed.record) : Promise.resolve(embed.record)
        ]);

        if (hydratedMedia === embed.media && hydratedRecord === embed.record) {
            return embed;
        }

        return {
            ...embed,
            media: hydratedMedia,
            record: hydratedRecord
        };
    }

    return embed;
}

async function hydrateRecordView(recordView) {
    if (!recordView || typeof recordView !== 'object') return recordView;
    if (recordView.$type === 'app.bsky.embed.record#viewRecord') return recordView;

    const uri = typeof recordView.uri === 'string' ? recordView.uri : '';
    const originalType = getRecordViewRecoveryType(recordView.$type);
    if (!uri || !originalType) return recordView;

    let recoveredPost;
    if (recoveryCache.has(uri)) {
        recoveredPost = recoveryCache.get(uri);
    } else {
        recoveredPost = await recoverPostByUri(uri, originalType);
        recoveryCache.set(uri, recoveredPost || null);
    }

    if (!recoveredPost) return recordView;
    return buildRecoveredRecordView(recoveredPost, recordView.$type);
}

function getRecordViewRecoveryType(recordViewType) {
    if (recordViewType === 'app.bsky.embed.record#viewBlocked') {
        return BLOCKED_POST;
    }
    if (recordViewType === 'app.bsky.embed.record#viewNotFound' || recordViewType === 'app.bsky.embed.record#viewDetached') {
        return NOT_FOUND_POST;
    }
    return '';
}

function buildRecoveredRecordView(post, originalViewType) {
    if (!post || typeof post !== 'object') return null;

    return {
        $type: 'app.bsky.embed.record#viewRecord',
        uri: post.uri || '',
        cid: post.cid || '',
        author: clonePlainData(post.author || null),
        value: clonePlainData(post.record || {}),
        _glimpskyQuoteRecovery: {
            ...(getRecoveryInfo(post) || {}),
            originalViewType
        }
    };
}

async function recoverPlaceholderNode(node, options = {}) {
    const uri = node && node.uri ? node.uri : '';
    const originalType = getThreadNodeType(node);
    const includeParent = Boolean(options.includeParent);
    if (!uri) return null;

    let recoveredPost;
    if (recoveryCache.has(uri)) {
        recoveredPost = recoveryCache.get(uri);
    } else {
        recoveredPost = await recoverPostByUri(uri, originalType);
        recoveryCache.set(uri, recoveredPost || null);
    }

    if (!recoveredPost) return null;

    const post = clonePlainData(recoveredPost);
    post._glimpskyRecovery = {
        ...(post._glimpskyRecovery || {}),
        originalType
    };

    return {
        $type: THREAD_VIEW_POST,
        post,
        parent: includeParent ? (node.parent || null) : null,
        replies: Array.isArray(node.replies) ? node.replies.slice() : []
    };
}

async function recoverPostByUri(uri, originalType) {
    const direct = await fetchPostViaAppView(uri, originalType);
    if (direct) return direct;
    return await fetchPostViaPds(uri, originalType);
}

async function fetchPostViaAppView(uri, originalType) {
    try {
        const data = await fetchJsonFromAppApi('app.bsky.feed.getPosts', { uris: uri });
        const post = Array.isArray(data.posts)
            ? data.posts.find((item) => item && item.uri === uri)
            : null;
        if (!post) return null;
        return {
            ...post,
            _glimpskyRecovery: {
                source: RECOVERY_APPVIEW,
                originalType
            }
        };
    } catch (error) {
        return null;
    }
}

async function fetchPostViaPds(uri, originalType) {
    const parsed = parseAtUri(uri);
    if (!parsed || parsed.collection !== 'app.bsky.feed.post') return null;

    try {
        const pdsUrl = await getPdsUrlForDid(parsed.did);
        if (!pdsUrl) return null;

        const recordUrl = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
        recordUrl.searchParams.set('repo', parsed.did);
        recordUrl.searchParams.set('collection', parsed.collection);
        recordUrl.searchParams.set('rkey', parsed.rkey);

        const response = await fetchWithTimeout(recordUrl.toString());
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || !data.value || typeof data.value !== 'object') return null;

        const author = await fetchProfileForDid(parsed.did);
        return {
            uri,
            cid: data.cid || '',
            author,
            record: data.value,
            embed: null,
            replyCount: null,
            repostCount: null,
            likeCount: null,
            _glimpskyRecovery: {
                source: RECOVERY_PDS,
                originalType
            }
        };
    } catch (error) {
        return null;
    }
}

function parseAtUri(uri) {
    const match = String(uri || '').match(/^at:\/\/(did:[^/]+)\/([^/]+)\/([^/?#]+)$/i);
    if (!match) return null;
    return {
        did: match[1],
        collection: match[2],
        rkey: match[3]
    };
}

async function fetchProfileForDid(did) {
    if (!did) return buildFallbackProfile(did);
    if (profileCache.has(did)) {
        return profileCache.get(did);
    }

    try {
        const data = await fetchJsonFromAppApi('app.bsky.actor.getProfile', { actor: did });
        const profile = {
            did,
            handle: data.handle || did,
            displayName: data.displayName || data.handle || shortDid(did),
            avatar: data.avatar || ''
        };
        profileCache.set(did, profile);
        return profile;
    } catch (error) {
        const fallback = buildFallbackProfile(did);
        profileCache.set(did, fallback);
        return fallback;
    }
}

async function fetchJsonFromAppApi(path, params = {}) {
    let lastError = null;

    for (const base of APP_API_BASES) {
        const url = new URL(`${base}/${path}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value == null || value === '') return;
            url.searchParams.set(key, String(value));
        });

        try {
            const response = await fetchWithTimeout(url.toString());
            if (!response.ok) {
                const message = await readErrorMessage(response);
                lastError = new Error(message || `Request failed with status ${response.status}.`);
                lastError.status = response.status;
                if (response.status === 400) {
                    throw lastError;
                }
                continue;
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            if (error && typeof error.message === 'string' && !/fetch|network|timed out|abort/i.test(error.message)) {
                throw error;
            }
        }
    }

    throw lastError || new Error(`All public app endpoints failed for ${path}.`);
}

function buildFallbackProfile(did) {
    return {
        did: did || '',
        handle: did || '',
        displayName: shortDid(did) || 'Unknown author',
        avatar: ''
    };
}

async function getPdsUrlForDid(did) {
    if (!did) return '';
    if (pdsUrlCache.has(did)) {
        return pdsUrlCache.get(did);
    }

    const didDoc = await fetchDidDocument(did);
    if (!didDoc) {
        pdsUrlCache.set(did, '');
        return '';
    }

    const services = Array.isArray(didDoc.service) ? didDoc.service : [];
    const pdsService = services.find((service) => {
        if (!service || typeof service !== 'object') return false;
        const id = typeof service.id === 'string' ? service.id : '';
        const type = typeof service.type === 'string' ? service.type : '';
        return id === '#atproto_pds' || id === `${did}#atproto_pds` || type === 'AtprotoPersonalDataServer';
    });

    const endpoint = pdsService && typeof pdsService.serviceEndpoint === 'string'
        ? pdsService.serviceEndpoint
        : '';
    pdsUrlCache.set(did, endpoint);
    return endpoint;
}

async function fetchDidDocument(did) {
    if (!did) return null;
    if (didDocumentCache.has(did)) {
        return didDocumentCache.get(did);
    }

    const candidates = [];
    if (did.startsWith('did:web:')) {
        const didWebUrl = buildDidWebDocumentUrl(did);
        if (didWebUrl) {
            candidates.push(didWebUrl);
        }
    }
    candidates.push(`https://plc.directory/${did}`);

    for (const url of candidates) {
        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) continue;
            const data = await response.json();
            didDocumentCache.set(did, data);
            return data;
        } catch (error) {
            // try next source
        }
    }

    didDocumentCache.set(did, null);
    return null;
}

function buildDidWebDocumentUrl(did) {
    if (!did || !did.startsWith('did:web:')) return '';
    const methodSpecific = did.slice('did:web:'.length);
    if (!methodSpecific) return '';

    const rawSegments = methodSpecific.split(':');
    if (!rawSegments.length) return '';

    const decodeSafe = (value) => {
        try {
            return decodeURIComponent(value);
        } catch (error) {
            return value;
        }
    };

    const host = decodeSafe(rawSegments[0]);
    if (!host) return '';

    const pathSegments = rawSegments.slice(1).map((segment) => encodeURIComponent(decodeSafe(segment)));
    if (!pathSegments.length) {
        return `https://${host}/.well-known/did.json`;
    }

    return `https://${host}/${pathSegments.join('/')}/did.json`;
}

function buildConversationRoot(thread) {
    if (!thread || typeof thread !== 'object') return thread;

    const ancestors = collectAncestorChain(thread);
    if (!ancestors.length) {
        return stripParentLinks(thread);
    }

    const path = [...ancestors, thread];
    const rootClone = cloneNodeForConversation(path[0], false);
    let cursor = rootClone;

    for (let idx = 1; idx < path.length; idx += 1) {
        const source = path[idx];
        const includeReplies = idx === path.length - 1;
        const childClone = cloneNodeForConversation(source, includeReplies);
        cursor.replies = [childClone];
        cursor = childClone;
    }

    return rootClone;
}

function cloneNodeForConversation(node, includeReplies) {
    const cloned = clonePlainData(node);
    if (cloned && typeof cloned === 'object') {
        delete cloned.parent;
        if (Array.isArray(cloned.replies)) {
            cloned.replies = includeReplies
                ? cloned.replies.map((reply) => stripParentLinks(reply))
                : [];
        } else {
            cloned.replies = [];
        }
    }
    return cloned;
}

function stripParentLinks(node) {
    if (!node || typeof node !== 'object') return node;
    const cloned = clonePlainData(node);
    delete cloned.parent;
    if (Array.isArray(cloned.replies)) {
        cloned.replies = cloned.replies.map((reply) => stripParentLinks(reply));
    } else {
        cloned.replies = [];
    }
    return cloned;
}

function getRootUriFromThread(thread, fallbackUri = '') {
    if (!thread || typeof thread !== 'object') return fallbackUri || '';

    if (isThreadViewPost(thread)) {
        const rootRef = thread.post && thread.post.record && thread.post.record.reply && thread.post.record.reply.root
            ? thread.post.record.reply.root
            : null;
        if (rootRef && typeof rootRef.uri === 'string' && rootRef.uri) {
            return rootRef.uri;
        }

        const chain = collectAncestorChain(thread);
        const firstVisible = chain.find((node) => isThreadViewPost(node) && node.post && node.post.uri);
        if (firstVisible && firstVisible.post && firstVisible.post.uri) {
            return firstVisible.post.uri;
        }

        if (thread.post && thread.post.uri) {
            return thread.post.uri;
        }
    }

    return fallbackUri || '';
}

function clonePlainData(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function collectThreadPath(node) {
    return [...collectAncestorChain(node), node].filter(Boolean);
}

function mergeFetchedThread(thread, mergedNodes) {
    const path = collectThreadPath(thread);
    path.forEach((node, index) => {
        const parentUri = index > 0 ? getNodeUri(path[index - 1]) : '';
        mergeReplySubtree(node, mergedNodes, parentUri, new Set());
    });
}

function mergeReplySubtree(node, mergedNodes, parentUri = '', visitTrail = new Set()) {
    if (!node || typeof node !== 'object') return;
    const uri = getNodeUri(node);
    if (!uri) return;

    const visitKey = `${parentUri || '_root'}>${uri}`;
    if (visitTrail.has(visitKey)) return;
    visitTrail.add(visitKey);

    const merged = updateMergedNode(mergedNodes, node);
    const recordParentUri = isThreadViewPost(node) ? getRecordParentUri(node.post) : '';
    const effectiveParentUri = recordParentUri || parentUri;

    if (effectiveParentUri) {
        assignMergedParent(mergedNodes, uri, effectiveParentUri);
    }

    const replies = Array.isArray(node.replies) ? node.replies : [];
    replies.forEach((reply) => {
        mergeReplySubtree(reply, mergedNodes, uri, visitTrail);
    });

    return merged;
}

function createMergedNode(uri) {
    return {
        uri,
        $type: NOT_FOUND_POST,
        post: null,
        author: null,
        parentUri: '',
        rootUri: '',
        replyCount: 0,
        replyUris: new Set(),
        createdAt: '',
        problemTypes: new Set(),
        synthetic: true,
        recoveryAttempted: false
    };
}

function ensureMergedNode(mergedNodes, uri) {
    if (!uri) return null;
    if (!mergedNodes.has(uri)) {
        mergedNodes.set(uri, createMergedNode(uri));
    }
    return mergedNodes.get(uri);
}

function updateMergedNode(mergedNodes, node) {
    const uri = getNodeUri(node);
    if (!uri) return null;

    const merged = ensureMergedNode(mergedNodes, uri);
    const nextType = getThreadNodeType(node);
    recordMergedProblemType(merged, nextType);
    if (shouldUpgradeThreadNodeType(merged.$type, nextType)) {
        merged.$type = nextType;
    }

    if (nextType === THREAD_VIEW_POST) {
        merged.post = clonePlainData(node.post || {});
        const recovery = getRecoveryInfo(node.post || null);
        if (recovery && recovery.originalType) {
            recordMergedProblemType(merged, recovery.originalType);
        }
        merged.author = clonePlainData(node.post && node.post.author ? node.post.author : null);
        merged.replyCount = Number(node.post && node.post.replyCount) || 0;
        merged.createdAt = getPostCreatedAt(node.post);
        merged.rootUri = getRecordRootUri(node.post) || merged.rootUri;
        const recordParentUri = getRecordParentUri(node.post);
        if (recordParentUri) {
            assignMergedParent(mergedNodes, uri, recordParentUri);
        }
        merged.synthetic = false;
        merged.recoveryAttempted = true;
        return merged;
    }

    if ((nextType === BLOCKED_POST || nextType === NOT_FOUND_POST) && node.author) {
        merged.author = clonePlainData(node.author);
    }
    merged.synthetic = false;
    return merged;
}

async function recoverMergedPlaceholders(mergedNodes) {
    const recoveredUris = [];
    for (const merged of mergedNodes.values()) {
        if (!merged || merged.$type === THREAD_VIEW_POST || merged.recoveryAttempted || !merged.uri) continue;

        recordMergedProblemType(merged, merged.$type);
        merged.recoveryAttempted = true;
        const recoveredPost = await recoverPostByUri(merged.uri, merged.$type);
        if (!recoveredPost) continue;

        merged.$type = THREAD_VIEW_POST;
        merged.post = clonePlainData(recoveredPost);
        merged.author = clonePlainData(recoveredPost.author || null);
        merged.replyCount = Number(recoveredPost.replyCount);
        if (!Number.isFinite(merged.replyCount)) {
            merged.replyCount = null;
        }
        merged.createdAt = getPostCreatedAt(recoveredPost);
        merged.rootUri = getRecordRootUri(recoveredPost) || merged.rootUri;
        const recordParentUri = getRecordParentUri(recoveredPost);
        if (recordParentUri) {
            assignMergedParent(mergedNodes, merged.uri, recordParentUri);
        }
        merged.synthetic = false;
        recoveredUris.push(merged.uri);
    }
    return recoveredUris;
}

function shouldUpgradeThreadNodeType(currentType, nextType) {
    const rank = {
        '': 0,
        [NOT_FOUND_POST]: 1,
        [BLOCKED_POST]: 2,
        [THREAD_VIEW_POST]: 3
    };
    return (rank[nextType] || 0) >= (rank[currentType] || 0);
}

function recordMergedProblemType(merged, type) {
    if (!merged || !merged.problemTypes || (type !== BLOCKED_POST && type !== NOT_FOUND_POST)) {
        return;
    }
    merged.problemTypes.add(type);
}

function getMergedProblemType(merged) {
    if (!merged || !merged.problemTypes) return '';
    if (merged.problemTypes.has(BLOCKED_POST)) return BLOCKED_POST;
    if (merged.problemTypes.has(NOT_FOUND_POST)) return NOT_FOUND_POST;
    return '';
}

function assignMergedParent(mergedNodes, childUri, parentUri) {
    if (!childUri || !parentUri || childUri === parentUri) return;
    const child = ensureMergedNode(mergedNodes, childUri);
    const parent = ensureMergedNode(mergedNodes, parentUri);
    if (!child || !parent) return;

    if (child.parentUri && child.parentUri !== parentUri) {
        const previousParent = mergedNodes.get(child.parentUri);
        if (previousParent && previousParent.replyUris) {
            previousParent.replyUris.delete(childUri);
        }
    }

    child.parentUri = parentUri;
    parent.replyUris.add(childUri);
}

function queueExpandablePosts(mergedNodes, fetchQueue, queuedUris, fetchedUris, rootUri) {
    for (const merged of mergedNodes.values()) {
        if (!merged || merged.$type !== THREAD_VIEW_POST || fetchedUris.has(merged.uri)) continue;
        if (!belongsToRootThread(merged, rootUri)) continue;
        if ((Number(merged.replyCount) || 0) <= 0) continue;
        enqueueThreadFetch(fetchQueue, queuedUris, fetchedUris, merged.uri);
    }
}

function queueRecoveredExpansionTargets(mergedNodes, recoveredUris, fetchQueue, queuedUris, fetchedUris, rootUri) {
    const uris = Array.isArray(recoveredUris) ? recoveredUris : [];
    uris.forEach((uri) => {
        const merged = mergedNodes.get(uri);
        if (!merged || merged.$type !== THREAD_VIEW_POST) return;
        if (!belongsToRootThread(merged, rootUri)) return;

        const knownReplyCount = Number(merged.replyCount);
        const childCount = merged.replyUris ? merged.replyUris.size : 0;
        if (Number.isFinite(knownReplyCount)) {
            if (knownReplyCount <= childCount) return;
            enqueueThreadFetch(fetchQueue, queuedUris, fetchedUris, merged.uri);
            return;
        }

        if (childCount === 0) {
            enqueueThreadFetch(fetchQueue, queuedUris, fetchedUris, merged.uri);
        }
    });
}

function enqueueThreadFetch(fetchQueue, queuedUris, fetchedUris, uri) {
    if (!uri || fetchedUris.has(uri) || queuedUris.has(uri)) return;
    fetchQueue.push(uri);
    queuedUris.add(uri);
}

function belongsToRootThread(merged, rootUri) {
    if (!merged) return false;
    if (merged.uri === rootUri) return true;
    if (merged.rootUri && rootUri) return merged.rootUri === rootUri;
    return false;
}

function buildMergedThreadTree(mergedNodes, rootUri, fallbackUri = '') {
    const resolvedRootUri = resolveMergedRootUri(mergedNodes, rootUri || fallbackUri);
    if (!resolvedRootUri) return null;
    return materializeMergedThreadNode(mergedNodes, resolvedRootUri, new Set());
}

function resolveMergedRootUri(mergedNodes, candidateUri) {
    if (candidateUri && mergedNodes.has(candidateUri)) {
        let cursor = candidateUri;
        const seen = new Set();
        while (cursor && mergedNodes.has(cursor) && !seen.has(cursor)) {
            seen.add(cursor);
            const merged = mergedNodes.get(cursor);
            if (!merged || !merged.parentUri) {
                return cursor;
            }
            cursor = merged.parentUri;
        }
        return candidateUri;
    }

    for (const merged of mergedNodes.values()) {
        if (merged && !merged.parentUri) {
            return merged.uri;
        }
    }

    const first = mergedNodes.values().next();
    return first && first.value ? first.value.uri : '';
}

function materializeMergedThreadNode(mergedNodes, uri, ancestry) {
    if (!uri || ancestry.has(uri)) return null;
    const merged = mergedNodes.get(uri);
    if (!merged) return null;

    ancestry.add(uri);

    const node = buildThreadNodeFromMerged(merged);
    if (!node) {
        ancestry.delete(uri);
        return null;
    }

    const childUris = Array.from(merged.replyUris || []).sort((leftUri, rightUri) => {
        const left = mergedNodes.get(leftUri);
        const right = mergedNodes.get(rightUri);
        return compareMergedNodes(left, right);
    });

    node.replies = childUris
        .map((childUri) => materializeMergedThreadNode(mergedNodes, childUri, ancestry))
        .filter(Boolean);

    ancestry.delete(uri);
    return node;
}

function buildThreadNodeFromMerged(merged) {
    if (!merged) return null;

    if (merged.$type === THREAD_VIEW_POST && merged.post) {
        const post = clonePlainData(merged.post);
        const problemType = getMergedProblemType(merged);
        if (problemType) {
            post._glimpskyThreadProblem = {
                originalType: problemType
            };
        }
        return {
            $type: THREAD_VIEW_POST,
            post,
            replies: []
        };
    }

    if (merged.$type === BLOCKED_POST) {
        return {
            $type: BLOCKED_POST,
            uri: merged.uri,
            author: clonePlainData(merged.author),
            replies: []
        };
    }

    return {
        $type: NOT_FOUND_POST,
        uri: merged.uri,
        author: clonePlainData(merged.author),
        replies: []
    };
}

function compareMergedNodes(left, right) {
    const leftTime = left && left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
    const rightTime = right && right.createdAt ? Date.parse(right.createdAt) : Number.NaN;

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    if (Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return -1;
    if (!Number.isFinite(leftTime) && Number.isFinite(rightTime)) return 1;

    const leftUri = left && left.uri ? left.uri : '';
    const rightUri = right && right.uri ? right.uri : '';
    return leftUri.localeCompare(rightUri);
}

function buildExpansionMeta(mergedNodes, fetchedUris, options = {}) {
    let unresolvedReplyCount = 0;
    for (const merged of mergedNodes.values()) {
        if (!merged || merged.$type !== THREAD_VIEW_POST) continue;
        const expected = Number(merged.replyCount) || 0;
        const actual = merged.replyUris ? merged.replyUris.size : 0;
        if (expected > actual) {
            unresolvedReplyCount += expected - actual;
        }
    }

    return {
        anchorUri: options.anchorUri || '',
        rootUri: options.rootUri || '',
        fetches: fetchedUris.size,
        discovered: mergedNodes.size,
        unresolvedReplyCount,
        truncated: Boolean(options.truncated),
        queued: Number(options.queued) || 0,
        lastFetchLimits: options.lastFetchLimits || null
    };
}

function getRecordParentUri(post) {
    const record = post && post.record ? post.record : null;
    const reply = record && record.reply ? record.reply : null;
    const parent = reply && reply.parent ? reply.parent : null;
    return parent && typeof parent.uri === 'string' ? parent.uri : '';
}

function getRecordRootUri(post) {
    const record = post && post.record ? post.record : null;
    const reply = record && record.reply ? record.reply : null;
    const root = reply && reply.root ? reply.root : null;
    return root && typeof root.uri === 'string' ? root.uri : '';
}

function getPostCreatedAt(post) {
    const record = post && post.record ? post.record : null;
    return record && typeof record.createdAt === 'string' ? record.createdAt : '';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
        controller.abort(new Error('Request timed out'));
    }, timeoutMs);

    try {
        const nextOptions = {
            ...options,
            signal: controller.signal
        };
        return await fetch(url, nextOptions);
    } finally {
        window.clearTimeout(timer);
    }
}

function renderThread(thread, parsedReference) {
    const conversationRoot = buildConversationRoot(thread);
    const focusNode = findNodeByUri(conversationRoot, parsedReference.uri);
    const focusLabel = getNodeTitle(focusNode || conversationRoot, 'Selected post');

    document.title = `${focusLabel} - GlimpSky Thread Viewer`;

    elements.threadContent.innerHTML = buildThreadMarkup(conversationRoot, parsedReference);
    scrollToSelectedPost();
}

function buildThreadMarkup(conversationRoot, parsedReference) {
    if (!conversationRoot) {
        return `
            <div class="empty-state thread-empty-state">
                <p>No thread data available.</p>
            </div>
        `;
    }

    const firstProblem = findFirstProblemNode(conversationRoot);
    const firstProblemInfo = firstProblem ? getThreadProblemInfo(firstProblem) : null;
    const firstProblemLabel = firstProblem ? getNodeTitle(firstProblem, 'Unknown post') : '';
    const firstProblemText = getProblemPreviewText(firstProblem);
    const firstProblemBlockingUrl = firstProblem ? getBlockingListUrlForNode(firstProblem) : '';
    const firstProblemAnchor = firstProblem ? getThreadAnchorId(getNodeUri(firstProblem)) : '';

    return `
        ${firstProblem && firstProblemInfo ? `
            <div class="thread-break-banner">
                <div class="thread-break-banner-title">Thread break</div>
                <div class="thread-break-banner-body">
                    <strong>${escapeHtml(firstProblemLabel)}</strong>
                    ${firstProblemText ? `<span>${escapeHtml(firstProblemText)}</span>` : ''}
                    <span>${escapeHtml(firstProblemInfo.description)}</span>
                </div>
                <div class="thread-break-actions">
                    <a class="thread-break-jump" href="#${escapeHtml(firstProblemAnchor)}">Jump to break</a>
                    ${firstProblemBlockingUrl ? `<a class="thread-break-jump" href="${escapeHtml(firstProblemBlockingUrl)}" target="_blank" rel="noopener noreferrer">Author's blocking list</a>` : ''}
                </div>
            </div>
        ` : ''}
        <div class="thread-conversation">
            ${renderConversationBranch(conversationRoot, {
                focusUri: parsedReference.uri,
                depth: 0,
                parentNode: null,
                firstProblemUri: firstProblem ? getNodeUri(firstProblem) : ''
            })}
        </div>
    `;
}

function findNodeByUri(node, uri) {
    if (!node || !uri) return null;
    if (getNodeUri(node) === uri) return node;
    if (!isThreadViewPost(node) || !Array.isArray(node.replies)) return null;
    for (const reply of node.replies) {
        const found = findNodeByUri(reply, uri);
        if (found) return found;
    }
    return null;
}

function findNodeDepth(node, uri, depth = 0) {
    if (!node || !uri) return 0;
    if (getNodeUri(node) === uri) return depth;
    if (!isThreadViewPost(node) || !Array.isArray(node.replies)) return 0;
    for (const reply of node.replies) {
        const found = findNodeDepth(reply, uri, depth + 1);
        if (found || getNodeUri(reply) === uri) return found;
    }
    return 0;
}

function getNodeUri(node) {
    if (!node || typeof node !== 'object') return '';
    if (isThreadViewPost(node) && node.post && node.post.uri) return node.post.uri;
    return typeof node.uri === 'string' ? node.uri : '';
}

function renderConversationBranch(node, options = {}) {
    const depth = Number(options.depth) || 0;
    const isVisible = isThreadViewPost(node);
    const children = isVisible && Array.isArray(node.replies) ? node.replies : [];
    const nodeMarkup = renderThreadNode(node, {
        isFocus: getNodeUri(node) === options.focusUri,
        isFirstProblem: Boolean(options.firstProblemUri) && getNodeUri(node) === options.firstProblemUri,
        isRoot: depth === 0,
        depth,
        parentNode: options.parentNode || null
    });
    const childrenMarkup = children.map((reply) => renderConversationBranch(reply, {
        focusUri: options.focusUri,
        firstProblemUri: options.firstProblemUri,
        depth: depth + 1,
        parentNode: node
    })).join('');

    return `
        <div class="thread-entry${depth > 0 ? ' is-nested' : ' is-root'}">
            ${nodeMarkup}
        </div>
        ${childrenMarkup}
    `;
}

function renderThreadNode(node, options = {}) {
    const type = getThreadNodeType(node);
    if (type === THREAD_VIEW_POST) {
        return renderVisiblePostNode(node, options);
    }
    if (type === BLOCKED_POST) {
        return renderBlockedNode(node, options);
    }
    if (type === NOT_FOUND_POST) {
        return renderNotFoundNode(node, options);
    }
    return renderUnknownNode(node, options);
}

function renderVisiblePostNode(node, options = {}) {
    const post = node.post || {};
    const author = post.author || {};
    const record = post.record || {};
    const recovery = getRecoveryInfo(post);
    const problemInfo = getThreadProblemInfo(node);
    const replyTarget = getReplyTargetInfo(node, options.parentNode);
    const authorName = escapeHtml(author.displayName || author.handle || shortDid(author.did) || 'Unknown author');
    const authorHandle = author.handle ? `@${escapeHtml(author.handle)}` : escapeHtml(shortDid(author.did) || 'Unknown handle');
    const timestamp = parseDateValue(record.createdAt);
    const timeLabel = timestamp ? formatEuDate(timestamp) : '—';
    const exactTimeLabel = record.createdAt ? formatExactTime(record.createdAt) : '';
    const postUrl = getPostUrl(post);
    const articleId = getThreadAnchorId(post.uri || '');
    const textHtml = formatPostText(record);
    const embeds = renderEmbedStack(post.embed);
    const blockingListUrl = problemInfo ? getBlockingListUrlForNode(node) : '';
    let banners = '';
    if (options.isRoot) {
        banners += '<div class="thread-post-banner is-root">Conversation start</div>';
    }
    if (options.isFocus) {
        banners += '<div class="thread-post-banner is-focus">Selected post</div>';
    }
    if (problemInfo) {
        banners += `<div class="thread-post-banner ${escapeHtml(problemInfo.bannerClass)}">${escapeHtml(problemInfo.label)}</div>`;
    }
    const actionMarkup = `
        ${blockingListUrl ? `<a class="copy-link-btn is-problem-action" href="${escapeHtml(blockingListUrl)}" target="_blank" rel="noopener noreferrer">Blocking list</a>` : ''}
        ${postUrl ? `<a class="copy-link-btn" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer">Open in Bluesky</a>` : ''}
        ${postUrl ? `<button class="copy-link-btn" type="button" data-copy-post-url="${escapeHtml(postUrl)}">Copy link</button>` : ''}
    `;

    return `
        <article id="${escapeHtml(articleId)}" class="post thread-post${options.isRoot ? ' is-root-post' : ''}${options.isFocus ? ' is-focus' : ''}${problemInfo ? ` ${problemInfo.postClass}` : ''}${options.isFirstProblem ? ' is-first-problem' : ''}" data-node-uri="${escapeHtml(post.uri || '')}"${options.isFocus ? ' data-selected-post="true"' : ''}${options.isFirstProblem ? ' data-first-problem="true"' : ''}>
            ${banners}
            <div class="post-header">
                ${renderAvatarImg(author.avatar, authorName, 'post-avatar')}
                <div class="post-author">
                    <div class="post-name">${authorName}</div>
                    <div class="post-handle">${authorHandle}</div>
                </div>
                <div class="thread-post-meta">
                    <div class="post-time"${exactTimeLabel ? ` title="${escapeHtml(exactTimeLabel)}"` : ''}>${escapeHtml(timeLabel)}</div>
                    <div class="post-actions">
                        ${actionMarkup}
                    </div>
                </div>
            </div>
            ${replyTarget ? renderReplyTarget(replyTarget) : ''}
            ${textHtml ? `<div class="post-text">${textHtml}</div>` : '<div class="thread-placeholder-copy">No text content in this record.</div>'}
            ${problemInfo ? renderProblemNote(problemInfo, node) : ''}
            ${embeds}
            <div class="post-engagement">
                <span>${formatCount(post.replyCount)} replies</span>
                <span>${formatCount(post.repostCount)} reposts</span>
                <span>${formatCount(post.likeCount)} likes</span>
            </div>
        </article>
    `;
}

function renderBlockedNode(node, options = {}) {
    const actor = node && node.author ? node.author : null;
    const title = actor ? getActorLabel(actor) : 'Blocked post';
    const handle = actor && actor.handle ? `@${escapeHtml(actor.handle)}` : '';
    const uri = node && node.uri ? node.uri : '';
    const articleId = getThreadAnchorId(uri);
    const problemInfo = getThreadProblemInfo(node);
    const replyTarget = getReplyTargetInfo(node, options.parentNode);

    return `
        <article id="${escapeHtml(articleId)}" class="post thread-post thread-post-placeholder is-blocked${options.isRoot ? ' is-root-post' : ''}${problemInfo ? ` ${problemInfo.postClass}` : ''}${options.isFirstProblem ? ' is-first-problem' : ''}" data-node-uri="${escapeHtml(uri)}"${options.isFirstProblem ? ' data-first-problem="true"' : ''}>
            ${options.isRoot ? '<div class="thread-post-banner is-root">Conversation start</div>' : ''}
            <div class="thread-post-banner ${problemInfo ? problemInfo.bannerClass : 'is-blocked'}">${escapeHtml(problemInfo ? problemInfo.label : 'Blocked placeholder')}</div>
            <div class="post-header">
                <div class="post-avatar thread-avatar-placeholder">!</div>
                <div class="post-author">
                    <div class="post-name">${escapeHtml(title)}</div>
                    <div class="post-handle">${handle || 'No handle available'}</div>
                </div>
                <div class="thread-post-meta">
                    <div class="post-time">—</div>
                </div>
            </div>
            ${replyTarget ? renderReplyTarget(replyTarget) : ''}
            <div class="post-text">
                The Bluesky thread API returned a blocked placeholder here. The gap is real, but public endpoints do not reveal which participant created the block relationship.
            </div>
            ${problemInfo ? renderProblemNote(problemInfo, node) : ''}
            ${uri ? `<div class="thread-uri">${escapeHtml(uri)}</div>` : ''}
        </article>
    `;
}

function renderNotFoundNode(node, options = {}) {
    const uri = node && node.uri ? node.uri : '';
    const articleId = getThreadAnchorId(uri);
    const problemInfo = getThreadProblemInfo(node);
    const replyTarget = getReplyTargetInfo(node, options.parentNode);
    return `
        <article id="${escapeHtml(articleId)}" class="post thread-post thread-post-placeholder is-missing${options.isRoot ? ' is-root-post' : ''}${problemInfo ? ` ${problemInfo.postClass}` : ''}${options.isFirstProblem ? ' is-first-problem' : ''}" data-node-uri="${escapeHtml(uri)}"${options.isFirstProblem ? ' data-first-problem="true"' : ''}>
            ${options.isRoot ? '<div class="thread-post-banner is-root">Conversation start</div>' : ''}
            <div class="thread-post-banner ${problemInfo ? problemInfo.bannerClass : 'is-missing'}">${escapeHtml(problemInfo ? problemInfo.label : 'Unavailable placeholder')}</div>
            <div class="post-header">
                <div class="post-avatar thread-avatar-placeholder">?</div>
                <div class="post-author">
                    <div class="post-name">Unavailable post</div>
                    <div class="post-handle">Deleted or hidden</div>
                </div>
                <div class="thread-post-meta">
                    <div class="post-time">—</div>
                </div>
            </div>
            ${replyTarget ? renderReplyTarget(replyTarget) : ''}
            <div class="post-text">
                This position in the thread is unavailable. The record may be deleted, deactivated, or not exposed by the current thread response.
            </div>
            ${problemInfo ? renderProblemNote(problemInfo, node) : ''}
            ${uri ? `<div class="thread-uri">${escapeHtml(uri)}</div>` : ''}
        </article>
    `;
}

function renderUnknownNode(node) {
    const type = node && node.$type ? node.$type : 'unknown';
    return `
        <article class="post thread-post thread-post-placeholder is-missing">
            <div class="thread-post-banner is-missing">Unsupported placeholder</div>
            <div class="post-text">
                Unsupported thread node type: ${escapeHtml(type)}
            </div>
        </article>
    `;
}

function getReplyTargetInfo(node, parentNode) {
    if (!node) return null;

    if (parentNode) {
        const parentType = getThreadNodeType(parentNode);
        if (parentType === THREAD_VIEW_POST) {
            const author = parentNode.post && parentNode.post.author ? parentNode.post.author : null;
            const actor = author && (author.handle || author.did) ? `@${author.handle || shortDid(author.did)}` : 'previous post';
            const parentUri = getNodeUri(parentNode);
            return {
                label: actor,
                prefix: 'Reply to',
                kindClass: 'is-visible',
                href: parentUri ? `#${getThreadAnchorId(parentUri)}` : ''
            };
        }
        if (parentType === BLOCKED_POST) {
            const actor = parentNode && parentNode.author && (parentNode.author.handle || parentNode.author.did)
                ? `@${parentNode.author.handle || shortDid(parentNode.author.did)}`
                : '';
            const parentUri = getNodeUri(parentNode);
            return {
                label: actor || 'blocked post',
                prefix: 'Reply to',
                kindClass: 'is-problem',
                href: parentUri ? `#${getThreadAnchorId(parentUri)}` : ''
            };
        }
        if (parentType === NOT_FOUND_POST) {
            const parentUri = getNodeUri(parentNode);
            return {
                label: 'unavailable post',
                prefix: 'Reply to',
                kindClass: 'is-missing',
                href: parentUri ? `#${getThreadAnchorId(parentUri)}` : ''
            };
        }
    }

    if (isThreadViewPost(node)) {
        const record = node.post && node.post.record ? node.post.record : null;
        const replyParent = record && record.reply && record.reply.parent ? record.reply.parent : null;
        if (replyParent && typeof replyParent.uri === 'string') {
            return {
                label: 'earlier thread post',
                prefix: 'Reply to',
                kindClass: 'is-fallback'
            };
        }
    }

    return null;
}

function findFirstProblemNode(node) {
    const blockedFirst = findFirstProblemNodeByType(node, BLOCKED_POST);
    if (blockedFirst) return blockedFirst;
    return findFirstProblemNodeByType(node, NOT_FOUND_POST);
}

function findFirstProblemNodeByType(node, type) {
    if (!node) return null;
    const info = getThreadProblemInfo(node);
    if (info && info.problemType === type) return node;
    if (!isThreadViewPost(node) || !Array.isArray(node.replies)) return null;
    for (const reply of node.replies) {
        const found = findFirstProblemNodeByType(reply, type);
        if (found) return found;
    }
    return null;
}

function getProblemPreviewText(node) {
    if (!node) return '';
    if (isThreadViewPost(node)) {
        const text = ((node.post || {}).record || {}).text || '';
        return text ? truncateText(text, 140) : '';
    }
    return '';
}

function truncateText(text, maxLength) {
    const value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function getThreadProblemInfo(node) {
    const type = getThreadNodeType(node);
    if (type === BLOCKED_POST) {
        return {
            label: 'Thread break gap',
            description: 'This spot was replaced by a blocked placeholder in the public thread view. Public data does not reveal who blocked whom.',
            bannerClass: 'is-problem',
            postClass: 'is-thread-problem',
            hideRecoveryBanner: true,
            problemType: BLOCKED_POST
        };
    }

    if (type === NOT_FOUND_POST) {
        return {
            label: 'Missing from thread view',
            description: 'This position in the thread is unavailable in public thread data. The post may be deleted, deactivated, or otherwise hidden.',
            bannerClass: 'is-missing',
            postClass: 'is-thread-missing',
            hideRecoveryBanner: true,
            problemType: NOT_FOUND_POST
        };
    }

    if (!isThreadViewPost(node)) return null;

    const threadProblem = getThreadProblemMarker(node.post || null);
    const recovery = getRecoveryInfo(node.post || null);
    const problemType = (threadProblem && threadProblem.originalType) || (recovery && recovery.originalType) || '';
    if (!problemType) return null;

    if (problemType === BLOCKED_POST) {
        return {
            label: 'Thread break post',
            description: recovery
                ? 'This post broke the public thread view because it appeared as a blocked placeholder in context, but it is still publicly reachable. Public data does not reveal who blocked whom.'
                : 'This post broke the public thread view because it appeared as a blocked placeholder in context. Public data does not reveal who blocked whom.',
            bannerClass: 'is-problem',
            postClass: 'is-thread-problem',
            hideRecoveryBanner: true,
            problemType: BLOCKED_POST
        };
    }

    if (problemType === NOT_FOUND_POST) {
        return null;
    }

    return null;
}

function renderReplyTarget(replyTarget) {
    if (!replyTarget) return '';
    if (replyTarget.href) {
        return `
            <a class="thread-reply-target ${replyTarget.kindClass} is-link" href="${escapeHtml(replyTarget.href)}" title="Jump to parent post">
                <span class="thread-reply-prefix">${escapeHtml(replyTarget.prefix || 'Reply to')}</span>
                <span class="thread-reply-label">${escapeHtml(replyTarget.label)}</span>
                <span class="thread-reply-jump" aria-hidden="true">jump</span>
            </a>
        `;
    }
    return `
        <div class="thread-reply-target ${replyTarget.kindClass}">
            <span class="thread-reply-prefix">${escapeHtml(replyTarget.prefix || 'Reply to')}</span>
            <span class="thread-reply-label">${escapeHtml(replyTarget.label)}</span>
        </div>
    `;
}

function renderProblemNote(problemInfo, node) {
    const blockingListUrl = getBlockingListUrlForNode(node);
    return `
        <div class="thread-problem-note">
            <div>${escapeHtml(problemInfo.description)}</div>
            ${blockingListUrl ? `<div class="thread-problem-actions"><a class="copy-link-btn" href="${escapeHtml(blockingListUrl)}" target="_blank" rel="noopener noreferrer">Open author's blocking list</a></div>` : ''}
        </div>
    `;
}

function getBlockingListUrlForNode(node) {
    const actor = getNodeActor(node);
    return getBlockingListUrlForActor(actor);
}

function getBlockingListUrlForActor(actor) {
    if (!actor) return '';
    const actorId = actor.handle || actor.did || '';
    if (!actorId) return '';
    return `../?handle=${encodeURIComponent(actorId)}&mode=posts&list=blocking`;
}

function getNodeActor(node) {
    if (!node || typeof node !== 'object') return null;
    if (isThreadViewPost(node)) {
        return node.post && node.post.author ? node.post.author : null;
    }
    return node.author || null;
}

function renderEmbedStack(embed) {
    if (!embed || typeof embed !== 'object') return '';
    const items = [];

    if (embed.$type === 'app.bsky.embed.images#view') {
        items.push(renderImagesEmbed(embed));
    } else if (embed.$type === 'app.bsky.embed.external#view') {
        items.push(renderExternalEmbed(embed));
    } else if (embed.$type === 'app.bsky.embed.record#view') {
        items.push(renderRecordEmbed(embed.record));
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
        if (embed.media) {
            items.push(renderEmbedStack(embed.media));
        }
        if (embed.record) {
            items.push(renderRecordEmbed(embed.record));
        }
    } else if (embed.$type === 'app.bsky.embed.video#view') {
        items.push(renderVideoEmbed(embed));
    }

    const flatItems = items.flat().filter(Boolean);
    if (!flatItems.length) return '';
    return `<div class="thread-embed-stack">${flatItems.join('')}</div>`;
}

function renderImagesEmbed(embed) {
    const images = Array.isArray(embed.images) ? embed.images : [];
    if (!images.length) return '';

    return `
        <div class="thread-embed-card is-compact">
            <div class="thread-embed-label">Media</div>
            <div class="thread-image-grid">
                ${images.map((image) => {
                    const src = image && (image.fullsize || image.thumb) ? (image.fullsize || image.thumb) : '';
                    const alt = image && image.alt ? image.alt : '';
                    return src
                        ? `<img class="thread-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
                        : '';
                }).join('')}
            </div>
        </div>
    `;
}

function renderExternalEmbed(embed) {
    const external = embed && embed.external ? embed.external : null;
    if (!external) return '';
    const href = external.uri || '';
    const title = external.title || href || 'External link';
    const desc = external.description || '';
    const kind = getCompactExternalKind(external);

    return `
        <div class="thread-embed-card is-compact">
            <div class="thread-embed-label">${escapeHtml(kind)}</div>
            <div class="thread-embed-title">${escapeHtml(title)}</div>
            ${desc ? `<div class="thread-embed-desc">${escapeHtml(desc)}</div>` : ''}
            ${href ? `<div class="thread-embed-uri"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a></div>` : ''}
        </div>
    `;
}

function renderVideoEmbed(embed) {
    return `
        <div class="thread-embed-card is-compact">
            <div class="thread-embed-label">Video</div>
            <div class="thread-embed-desc">This post includes a video attachment.</div>
        </div>
    `;
}

function getCompactExternalKind(external) {
    const href = String(external && external.uri ? external.uri : '').toLowerCase();
    const title = String(external && external.title ? external.title : '').toLowerCase();

    if (/\.(gif)(?:$|\?)/.test(href) || /tenor|giphy/.test(href) || title.includes('gif')) {
        return 'GIF';
    }
    if (/\.(png|jpe?g|webp)(?:$|\?)/.test(href)) {
        return 'Image';
    }
    if (/\.(mp4|webm|mov)(?:$|\?)/.test(href)) {
        return 'Video';
    }
    return 'External link';
}

function renderRecordEmbed(recordView) {
    if (!recordView || typeof recordView !== 'object') return '';

    if (recordView.$type === 'app.bsky.embed.record#viewRecord') {
        const author = recordView.author || {};
        const value = recordView.value || {};
        const title = getActorLabel(author);
        const handle = author.handle ? `@${author.handle}` : shortDid(author.did);
        const text = typeof value.text === 'string' ? value.text : '';
        const postUrl = getPostUrl({
            uri: recordView.uri || '',
            author
        });
        const quoteRecovery = getQuoteRecoveryInfo(recordView);
        const quoteProblem = getQuoteProblemInfo(recordView);
        const blockingListUrl = quoteProblem ? getBlockingListUrlForActor(author) : '';
        const textHtml = text
            ? formatPostText(value)
            : '<div class="thread-embed-desc">No text preview.</div>';

        return `
            <div class="thread-embed-card is-compact${quoteProblem ? ' is-problem' : ''}">
                <div class="thread-embed-label">Quote</div>
                <div class="thread-embed-title">${escapeHtml(title)}${handle ? ` <span class="post-handle">${escapeHtml(handle)}</span>` : ''}</div>
                ${quoteRecovery ? `<div class="thread-embed-meta">${escapeHtml(quoteProblem ? 'Blocked in context, recovered from public data' : 'Recovered from public data')}</div>` : ''}
                <div class="thread-embed-desc">${textHtml}</div>
                ${(blockingListUrl || postUrl) ? `
                    <div class="thread-embed-actions">
                        ${blockingListUrl ? `<a class="copy-link-btn is-problem-action" href="${escapeHtml(blockingListUrl)}" target="_blank" rel="noopener noreferrer">Blocking list</a>` : ''}
                        <a class="copy-link-btn" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer">Open in Bluesky</a>
                        <button class="copy-link-btn" type="button" data-copy-post-url="${escapeHtml(postUrl)}">Copy link</button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (recordView.$type === 'app.bsky.embed.record#viewBlocked') {
        const blockingListUrl = getBlockingListUrlForActor(recordView.author || null);
        return `
            <div class="thread-embed-card is-compact is-problem">
                <div class="thread-embed-label">Quote</div>
                <div class="thread-embed-meta">Blocked in current view</div>
                <div class="thread-embed-desc">Quoted record is blocked in the current view.</div>
                ${blockingListUrl ? `
                    <div class="thread-embed-actions">
                        <a class="copy-link-btn is-problem-action" href="${escapeHtml(blockingListUrl)}" target="_blank" rel="noopener noreferrer">Blocking list</a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (recordView.$type === 'app.bsky.embed.record#viewNotFound') {
        return `
            <div class="thread-embed-card is-compact">
                <div class="thread-embed-label">Quote</div>
                <div class="thread-embed-desc">Quoted record is unavailable.</div>
            </div>
        `;
    }

    if (recordView.$type === 'app.bsky.embed.record#viewDetached') {
        return `
            <div class="thread-embed-card is-compact">
                <div class="thread-embed-label">Quote</div>
                <div class="thread-embed-desc">Quoted record is detached from the current app view.</div>
            </div>
        `;
    }

    return '';
}

function collectAncestorChain(node) {
    const chain = [];
    let cursor = node;
    while (cursor && cursor.parent) {
        chain.push(cursor.parent);
        cursor = cursor.parent;
    }
    return chain.reverse();
}

function collectThreadStats(thread) {
    const stats = {
        visible: 0,
        blocked: 0,
        notFound: 0,
        recovered: 0,
        recoveredAppView: 0,
        recoveredPds: 0,
        ancestors: collectAncestorChain(thread).length,
        maxReplyDepth: 0,
        recoveryRate: 0
    };

    const ancestors = collectAncestorChain(thread);
    ancestors.forEach((node) => {
        accumulateNodeStats(node, stats, 0);
    });
    walkReplyTree(thread, 0, stats);
    const totalRecoverable = stats.recovered + stats.blocked + stats.notFound;
    stats.recoveryRate = totalRecoverable > 0 ? (stats.recovered / totalRecoverable) * 100 : 0;

    return stats;
}

function walkReplyTree(node, depth, stats) {
    accumulateNodeStats(node, stats, depth);
    if (!isThreadViewPost(node)) return;
    const replies = Array.isArray(node.replies) ? node.replies : [];
    replies.forEach((reply) => {
        walkReplyTree(reply, depth + 1, stats);
    });
}

function accumulateNodeStats(node, stats, replyDepth) {
    const type = getThreadNodeType(node);
    if (type === THREAD_VIEW_POST) {
        stats.visible += 1;
        const recovery = getRecoveryInfo(node && node.post ? node.post : null);
        if (recovery) {
            stats.recovered += 1;
            if (recovery.source === RECOVERY_APPVIEW) {
                stats.recoveredAppView += 1;
            } else if (recovery.source === RECOVERY_PDS) {
                stats.recoveredPds += 1;
            }
        }
        stats.maxReplyDepth = Math.max(stats.maxReplyDepth, replyDepth);
    } else if (type === BLOCKED_POST) {
        stats.blocked += 1;
        stats.maxReplyDepth = Math.max(stats.maxReplyDepth, replyDepth);
    } else if (type === NOT_FOUND_POST) {
        stats.notFound += 1;
        stats.maxReplyDepth = Math.max(stats.maxReplyDepth, replyDepth);
    }
}

function getThreadNodeType(node) {
    return node && typeof node === 'object' && typeof node.$type === 'string'
        ? node.$type
        : '';
}

function isThreadViewPost(node) {
    return getThreadNodeType(node) === THREAD_VIEW_POST;
}

function getNodeTitle(node, fallback) {
    if (isThreadViewPost(node)) {
        return getActorLabel(node.post && node.post.author ? node.post.author : null);
    }
    if (getThreadNodeType(node) === BLOCKED_POST) {
        return 'Blocked post';
    }
    if (getThreadNodeType(node) === NOT_FOUND_POST) {
        return 'Unavailable post';
    }
    return fallback || 'Thread';
}

function getActorLabel(actor) {
    if (!actor || typeof actor !== 'object') return 'Unknown author';
    return actor.displayName || actor.handle || shortDid(actor.did) || 'Unknown author';
}

function getRecoveryInfo(post) {
    if (!post || typeof post !== 'object') return null;
    const recovery = post._glimpskyRecovery;
    if (!recovery || typeof recovery !== 'object') return null;
    return recovery;
}

function getQuoteRecoveryInfo(recordView) {
    if (!recordView || typeof recordView !== 'object') return null;
    const recovery = recordView._glimpskyQuoteRecovery;
    if (!recovery || typeof recovery !== 'object') return null;
    return recovery;
}

function getQuoteProblemInfo(recordView) {
    const recovery = getQuoteRecoveryInfo(recordView);
    if (!recovery) return null;
    if (recovery.originalViewType === 'app.bsky.embed.record#viewBlocked') {
        return {
            problemType: BLOCKED_POST
        };
    }
    return null;
}

function getThreadProblemMarker(post) {
    if (!post || typeof post !== 'object') return null;
    const marker = post._glimpskyThreadProblem;
    if (!marker || typeof marker !== 'object') return null;
    return marker;
}

function getPostUrl(post) {
    if (!post || !post.uri) return '';
    const author = post.author || {};
    const actor = author.handle || author.did || '';
    const postId = getPostIdFromUri(post.uri);
    if (!actor || !postId) return '';
    return `https://bsky.app/profile/${actor}/post/${postId}`;
}

function getPostIdFromUri(uri) {
    const parts = String(uri || '').split('/');
    return parts.length ? parts[parts.length - 1] : '';
}

function formatPostText(record) {
    const text = record && typeof record.text === 'string' ? record.text : '';
    if (!text) return '';
    const facets = Array.isArray(record.facets) ? record.facets.slice() : [];
    const html = facets.length ? applyFacets(text, facets) : linkifyPlainTextUrls(text);
    return html.replace(/\n/g, '<br>');
}

function linkifyPlainTextUrls(text) {
    const escaped = escapeHtml(text || '');
    const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;
    return escaped.replace(urlPattern, (match, _group, offset, fullText) => {
        if (offset > 0 && fullText[offset - 1] === '@') return match;

        let url = match;
        let trailing = '';
        while (url && /[.,!?;:)]$/.test(url)) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
        }
        if (!url) return match;

        const hasProtocol = /^https?:\/\//i.test(url);
        const href = hasProtocol ? url : `https://${url}`;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
    });
}

function applyFacets(text, facets) {
    const sorted = facets.slice().sort((a, b) => a.index.byteStart - b.index.byteStart);
    const byteIndexMap = buildByteIndexMap(text);
    let result = '';
    let lastByte = 0;

    sorted.forEach((facet) => {
        const startByte = facet.index.byteStart;
        const endByte = facet.index.byteEnd;
        const start = byteIndexMap[startByte] ?? 0;
        const end = byteIndexMap[endByte] ?? text.length;

        result += linkifyPlainTextUrls(text.substring(byteIndexMap[lastByte] ?? 0, start));

        const facetText = text.substring(start, end);
        const feature = Array.isArray(facet.features) ? facet.features[0] : null;

        if (feature && feature.$type === 'app.bsky.richtext.facet#link') {
            result += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
        } else if (feature && feature.$type === 'app.bsky.richtext.facet#mention') {
            result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
        } else if (feature && feature.$type === 'app.bsky.richtext.facet#tag') {
            result += `<span class="facet-tag">${escapeHtml(facetText)}</span>`;
        } else {
            result += linkifyPlainTextUrls(facetText);
        }

        lastByte = endByte;
    });

    result += linkifyPlainTextUrls(text.substring(byteIndexMap[lastByte] ?? 0));
    return result;
}

function buildByteIndexMap(text) {
    const encoder = new TextEncoder();
    const map = {};
    let bytePos = 0;
    let charIndex = 0;
    for (const char of text) {
        map[bytePos] = charIndex;
        bytePos += encoder.encode(char).length;
        charIndex += char.length;
    }
    map[bytePos] = charIndex;
    return map;
}

function parseDateValue(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatEuDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatExactTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
}

function formatRelativeTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const past = diffMs >= 0;
    const diffSeconds = Math.round(Math.abs(diffMs) / 1000);

    const units = [
        { limit: 60, unit: 'second' },
        { limit: 60 * 60, unit: 'minute', divisor: 60 },
        { limit: 60 * 60 * 24, unit: 'hour', divisor: 60 * 60 },
        { limit: 60 * 60 * 24 * 30, unit: 'day', divisor: 60 * 60 * 24 },
        { limit: 60 * 60 * 24 * 365, unit: 'month', divisor: 60 * 60 * 24 * 30 },
        { limit: Infinity, unit: 'year', divisor: 60 * 60 * 24 * 365 }
    ];

    for (const item of units) {
        if (diffSeconds < item.limit) {
            const amount = item.divisor ? Math.max(1, Math.round(diffSeconds / item.divisor)) : diffSeconds;
            const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
            return formatter.format(past ? -amount : amount, item.unit);
        }
    }

    return '';
}

function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return '0%';
    return `${Math.round(value)}%`;
}

function formatCount(value) {
    return Number.isFinite(value) ? formatNumber(value) : '—';
}

function scrollToSelectedPost() {
    const schedule = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
        const selected = document.querySelector('[data-selected-post="true"]');
        const target = selected || elements.threadResults || elements.threadContent;
        if (!target || typeof target.scrollIntoView !== 'function') return;
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
}

function shortDid(did) {
    const raw = String(did || '');
    if (!raw) return '';
    if (raw.length <= 18) return raw;
    return `${raw.slice(0, 12)}…${raw.slice(-5)}`;
}

function getThreadAnchorId(uri) {
    const value = String(uri || '').trim();
    if (!value) return 'thread-node-empty';
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `thread-node-${(hash >>> 0).toString(36)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

async function copyShareLink() {
    const shareUrl = buildShareUrl();
    await copyText(shareUrl, elements.copyShareBtn, 'Copied');
}

function buildShareUrl() {
    const url = new URL(window.location.href);
    const value = currentInputValue || elements.threadInput.value.trim();
    if (value) {
        url.searchParams.set('url', value);
    } else {
        url.searchParams.delete('url');
        url.searchParams.delete('uri');
    }
    return url.toString();
}

function updateLocationQuery(value) {
    currentInputValue = value;
    try {
        const url = new URL(window.location.href);
        if (value) {
            url.searchParams.set('url', value);
            url.searchParams.delete('uri');
        } else {
            url.searchParams.delete('url');
            url.searchParams.delete('uri');
        }
        window.history.replaceState({}, '', url.toString());
    } catch (error) {
        // ignore history failures (e.g. file://)
    }
}

async function copyText(text, button, successLabel = 'Copied') {
    if (!text) return;
    const original = button && button.textContent ? button.textContent : '';
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            window.prompt('Copy this link:', text);
        }
        if (button) {
            button.textContent = successLabel;
            window.setTimeout(() => {
                button.textContent = original;
            }, 1200);
        }
    } catch (error) {
        showError('Could not copy link.');
    }
}
