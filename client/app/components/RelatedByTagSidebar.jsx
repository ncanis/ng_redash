import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { uniqBy } from "lodash";

import Link from "@/components/Link";
import { Dashboard, urlForDashboard } from "@/services/dashboard";
import { Query } from "@/services/query";

import "./RelatedByTagSidebar.less";

function Section({ title, children }) {
  return (
    <div className="rbts-section">
      <div className="rbts-section-title">{title}</div>
      <div className="rbts-section-content">{children}</div>
    </div>
  );
}

Section.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node,
};

Section.defaultProps = { children: null };

export default function RelatedByTagSidebar({
  tags,
  excludeDashboardId,
  excludeQueryId,
  showDashboards,
  showQueries,
  activeDashboardId,
  activeQueryId,
  fetchTagsFromDashboardId,
  fetchTagsFromQueryId,
  queryLinkTo,
  onReady,
  className,
}) {
  const [dashboards, setDashboards] = useState([]);
  const [queries, setQueries] = useState([]);
  const [fetchedTags, setFetchedTags] = useState([]);
  const [tagsResolved, setTagsResolved] = useState(Array.isArray(tags) && tags.length > 0);
  const [anchorName, setAnchorName] = useState("");
  const effectiveTags = useMemo(() => (Array.isArray(tags) && tags.length > 0 ? tags : fetchedTags), [tags, fetchedTags]);
  const hasTags = useMemo(() => Array.isArray(effectiveTags) && effectiveTags.length > 0, [effectiveTags]);
  const untaggedMode = useMemo(() => !hasTags, [hasTags]);
  const [sidebarReady, setSidebarReady] = useState(false);

  // English > Hangul > others; then alphabetical within group
  const compareByLanguageThenAlpha = (aName, bName) => {
    const a = String(aName || "").trim();
    const b = String(bName || "").trim();
    const aCh = a.charAt(0);
    const bCh = b.charAt(0);

    const isAsciiLetter = ch => /[A-Za-z]/.test(ch);
    const isHangul = ch => {
      if (!ch) return false;
      const code = ch.charCodeAt(0);
      return (
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
        (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
        (code >= 0x3130 && code <= 0x318f) // Hangul Compatibility Jamo
      );
    };

    const group = ch => (isAsciiLetter(ch) ? 0 : isHangul(ch) ? 1 : 2);
    const gA = group(aCh);
    const gB = group(bCh);
    if (gA !== gB) return gA - gB;

    const locale = gA === 1 ? "ko" : "en";
    return a.localeCompare(b, locale, { sensitivity: "base" });
  };

  // Refs to manage auto-scrolling to the active item
  const containerRef = useRef(null);
  const activeItemRef = useRef(null);
  const anchorItemRef = useRef(null);

  // Persist and restore scroll position across navigation
  const storageKey = useMemo(() => {
    if (showDashboards && !showQueries) return "rbts.scroll.dashboard";
    if (showQueries && !showDashboards) return "rbts.scroll.query";
    return "rbts.scroll.mixed";
  }, [showDashboards, showQueries]);

  // Restore scroll on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) container.scrollTop = parseInt(saved, 10) || 0;
    } catch (e) {
      // ignore storage failures
    }
  }, [storageKey]);

  // Save scroll on change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(container.scrollTop || 0));
      } catch (e) {
        // ignore storage failures
      }
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, [storageKey]);

  // If no tags provided, optionally fetch tags by entity id so sidebar can populate early
  useEffect(() => {
    let cancelled = false;
    if (Array.isArray(tags) && tags.length > 0) {
      setFetchedTags([]);
      setTagsResolved(true);
      return () => {};
    }
    if (fetchTagsFromDashboardId) {
      // Use list API to get tags for the active dashboard (avoid detail API)
      Dashboard.query({ page: 1, page_size: 250 })
        .then(({ results }) => {
          let item = Array.isArray(results)
            ? results.find(d => String(d.id)=== String(fetchTagsFromDashboardId))
            : null;
          if (item) {
            setAnchorName(String(item.name || ""));
            return item.tags || [];
          }
          // Try another page to improve chances without using detail API
          return Dashboard.query({ page: 2, page_size: 250 }).then(({ results: more }) => {
            const found = Array.isArray(more)
              ? more.find(d => String(d.id) === String(fetchTagsFromDashboardId))
              : null;
            if (found) setAnchorName(String(found.name || ""));
            return found ? found.tags || [] : [];
          });
        })
        .then(t => {
          if (!cancelled) setFetchedTags(t);
          if (!cancelled) setTagsResolved(true);
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedTags([]);
            setTagsResolved(true);
          }
        });
    } else if (fetchTagsFromQueryId) {
      // Use list API search to find the query by id (avoid detail API)
      const qStr = String(fetchTagsFromQueryId);
      Query.query({ q: qStr, page: 1, page_size: 25 })
        .then(({ results }) => {
          let item = Array.isArray(results) ? results.find(q => String(q.id) === qStr) : null;
          if (!item) {
            // Fallback to a larger unfiltered page
            return Query.query({ page: 1, page_size: 250 }).then(({ results: all }) => {
              const found = Array.isArray(all) ? all.find(q => String(q.id) === qStr) : null;
              if (found) setAnchorName(String(found.name || ""));
              return found ? found.tags || [] : [];
            });
          }
          setAnchorName(String(item.name || ""));
          return item.tags || [];
        })
        .then(t => {
          if (!cancelled) setFetchedTags(t);
          if (!cancelled) setTagsResolved(true);
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedTags([]);
            setTagsResolved(true);
          }
        });
    } else {
      setFetchedTags([]);
      setTagsResolved(true);
    }
    return () => {
      cancelled = true;
    };
  }, [tags, fetchTagsFromDashboardId, fetchTagsFromQueryId]);

  useEffect(() => {
    let isCancelled = false;
    // Avoid showing an unfiltered full list before tags resolve.
    if (!tagsResolved) {
      setDashboards([]);
      setQueries([]);
      setSidebarReady(false);
      return () => {};
    }

    setSidebarReady(false);

    const fetchWithAnyTag = (Service, idsToExclude, activeFlag) => {
      if (!hasTags) {
        // No tags: fetch first page and filter to untagged later in memo
        return Service.query({ page: 1, page_size: 250 })
          .then(({ results }) => results || [])
          .then(items =>
            idsToExclude ? items.filter(it => String(it.id) !== String(idsToExclude)) : items
          );
      }
      // Has tags: fetch per-tag with server-side filtering (matches items containing that tag),
      // then merge client-side with OR semantics and uniq by id.
      const perTagRequests = effectiveTags.map(t =>
        Service.query({ page: 1, page_size: 250, tags: [t] })
          .then(({ results }) => results || [])
          .catch(() => [])
      );
      return Promise.all(perTagRequests).then(pages => {
        const merged = uniqBy([].concat(...pages), it => it.id);
        return idsToExclude
          ? merged.filter(it => String(it.id) !== String(idsToExclude))
          : merged;
      });
    };

    const dashboardsPromise = showDashboards
      ? fetchWithAnyTag(Dashboard, excludeDashboardId)
          .then(items => (isCancelled ? [] : setDashboards(items)))
          .catch(() => !isCancelled && setDashboards([]))
      : Promise.resolve().then(() => setDashboards([]));

    const queriesPromise = showQueries
      ? fetchWithAnyTag(Query, excludeQueryId)
          .then(items => (isCancelled ? [] : setQueries(items)))
          .catch(() => !isCancelled && setQueries([]))
      : Promise.resolve().then(() => setQueries([]));

    Promise.all([dashboardsPromise.catch(() => {}), queriesPromise.catch(() => {})]).then(() => {
      if (!isCancelled) setSidebarReady(true);
    });

    return () => {
      isCancelled = true;
    };
  }, [tagsResolved, hasTags, effectiveTags, excludeDashboardId, excludeQueryId, showDashboards, showQueries]);

  // Notify parent when sidebar is ready (first time)
  useEffect(() => {
    if (sidebarReady && typeof onReady === "function") {
      onReady();
    }
    // do not add onReady to deps intentionally to avoid re-calls when parent recreates callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarReady]);

  const dashboardItems = useMemo(() => {
    if (!hasTags) {
      const untagged = uniqBy(
        dashboards.filter(d => !(d.tags && d.tags.length)),
        d => d.id
      );
      return untagged.sort((a, b) => compareByLanguageThenAlpha(a.name, b.name));
    }
    // When tags are present, include dashboards that share at least one tag
    const items = dashboards.filter(d => Array.isArray(d.tags) && d.tags.some(t => effectiveTags.includes(t)));
    return uniqBy(items, d => d.id).sort((a, b) => compareByLanguageThenAlpha(a.name, b.name));
  }, [dashboards, hasTags, effectiveTags]);
  const queryItems = useMemo(() => {
    if (!hasTags) {
      const untagged = uniqBy(
        queries.filter(q => !(q.tags && q.tags.length)),
        q => q.id
      );
      return untagged.sort((a, b) => compareByLanguageThenAlpha(a.name, b.name));
    }
    const items = queries.filter(q => Array.isArray(q.tags) && q.tags.some(t => effectiveTags.includes(t)));
    return uniqBy(items, q => q.id).sort((a, b) => compareByLanguageThenAlpha(a.name, b.name));
  }, [queries, hasTags, effectiveTags]);

  // Compute where the active item would be placed in the sorted list and pick a neighbor
  const dashboardAnchorId = useMemo(() => {
    if (!anchorName || dashboardItems.length === 0) return null;
    let idx = dashboardItems.findIndex(d => compareByLanguageThenAlpha(d.name, anchorName) >= 0);
    if (idx < 0) idx = dashboardItems.length - 1;
    const target = dashboardItems[Math.max(0, Math.min(idx, dashboardItems.length - 1))];
    return target ? target.id : null;
  }, [anchorName, dashboardItems]);

  const queryAnchorId = useMemo(() => {
    if (!anchorName || queryItems.length === 0) return null;
    let idx = queryItems.findIndex(q => compareByLanguageThenAlpha(q.name, anchorName) >= 0);
    if (idx < 0) idx = queryItems.length - 1;
    const target = queryItems[Math.max(0, Math.min(idx, queryItems.length - 1))];
    return target ? target.id : null;
  }, [anchorName, queryItems]);

  const isEmpty = dashboardItems.length === 0 && queryItems.length === 0;

  // Scroll the active (or anchor) item into view on updates
  // Use layout effect to run before paint for smoother positioning
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const activeEl = activeItemRef.current || anchorItemRef.current;
    if (!container || !activeEl) return;
    const doScroll = () => {
      try {
        activeEl.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e) {
        container.scrollTop = Math.max(0, activeEl.offsetTop - container.clientHeight / 2);
      }
    };
    if ("requestAnimationFrame" in window) {
      window.requestAnimationFrame(doScroll);
    } else {
      setTimeout(doScroll, 0);
    }
  }, [sidebarReady, activeDashboardId, activeQueryId, dashboardItems.length, queryItems.length, dashboardAnchorId, queryAnchorId]);

  return (
    <aside ref={containerRef} className={`related-by-tag-sidebar ${className || ""}`.trim()}>
      <div className="rbts-header tiled">Related by Tag</div>
      {!sidebarReady && (
        <div className="rbts-section">
          <div className="rbts-section-title">Loading...</div>
          <ul className="rbts-list">
            <li className="rbts-item">Please wait</li>
          </ul>
        </div>
      )}
      {sidebarReady && dashboardItems.length > 0 && (
        <Section title="Dashboards">
          <ul className="rbts-list">
            {dashboardItems.map(d => (
              <li
                key={`d-${d.id}`}
                ref={
                  String(d.id) === String(activeDashboardId)
                    ? activeItemRef
                    : String(d.id) === String(dashboardAnchorId)
                    ? anchorItemRef
                    : null
                }
                className={`rbts-item${String(d.id) === String(activeDashboardId) ? " active" : ""}`.trim()}>
                <Link href={urlForDashboard(d)} title={d.name}>
                  <i className="fa fa-th-large m-r-5" aria-hidden="true" />
                  <span className="rbts-item-text">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {sidebarReady && queryItems.length > 0 && (
        <Section title="Queries">
          <ul className="rbts-list">
            {queryItems.map(q => (
              <li
                key={`q-${q.id}`}
                ref={
                  String(q.id) === String(activeQueryId)
                    ? activeItemRef
                    : String(q.id) === String(queryAnchorId)
                    ? anchorItemRef
                    : null
                }
                className={`rbts-item${String(q.id) === String(activeQueryId) ? " active" : ""}`.trim()}>
                <Link href={queryLinkTo === "edit" ? `/queries/${q.id}/source` : `/queries/${q.id}`} title={q.name}>
                  <i className="fa fa-code m-r-5" aria-hidden="true" />
                  <span className="rbts-item-text">{q.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {sidebarReady && isEmpty && (
        <div className="rbts-section">
          <div className="rbts-section-title">No related items</div>
        </div>
      )}
    </aside>
  );
}

RelatedByTagSidebar.propTypes = {
  tags: PropTypes.arrayOf(PropTypes.string),
  excludeDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  excludeQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showDashboards: PropTypes.bool,
  showQueries: PropTypes.bool,
  activeDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  activeQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fetchTagsFromDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fetchTagsFromQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  queryLinkTo: PropTypes.oneOf(["view", "edit"]),
  onReady: PropTypes.func,
  className: PropTypes.string,
};

RelatedByTagSidebar.defaultProps = {
  tags: [],
  excludeDashboardId: null,
  excludeQueryId: null,
  showDashboards: true,
  showQueries: true,
  activeDashboardId: null,
  activeQueryId: null,
  fetchTagsFromDashboardId: null,
  fetchTagsFromQueryId: null,
  queryLinkTo: "view",
  onReady: null,
  className: null,
};












