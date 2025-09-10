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
  onReady,
  className,
}) {
  const [dashboards, setDashboards] = useState([]);
  const [queries, setQueries] = useState([]);
  const [fetchedTags, setFetchedTags] = useState([]);
  const [tagsResolved, setTagsResolved] = useState(Array.isArray(tags) && tags.length > 0);
  const effectiveTags = useMemo(() => (Array.isArray(tags) && tags.length > 0 ? tags : fetchedTags), [tags, fetchedTags]);
  const hasTags = useMemo(() => Array.isArray(effectiveTags) && effectiveTags.length > 0, [effectiveTags]);
  const untaggedMode = useMemo(() => !hasTags, [hasTags]);
  const [sidebarReady, setSidebarReady] = useState(false);

  // Refs to manage auto-scrolling to the active item
  const containerRef = useRef(null);
  const activeItemRef = useRef(null);

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
            ? results.find(d => String(d.id) === String(fetchTagsFromDashboardId))
            : null;
          if (item) return item.tags || [];
          // Try another page to improve chances without using detail API
          return Dashboard.query({ page: 2, page_size: 250 }).then(({ results: more }) => {
            const found = Array.isArray(more)
              ? more.find(d => String(d.id) === String(fetchTagsFromDashboardId))
              : null;
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
              return found ? found.tags || [] : [];
            });
          }
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

    const commonParams = hasTags ? { page: 1, page_size: 250, tags: effectiveTags } : { page: 1, page_size: 250 };

    setSidebarReady(false);

    const dashboardsPromise = showDashboards
      ? Dashboard.query(commonParams)
          .then(({ results }) => results || [])
          .then(items => (excludeDashboardId ? items.filter(d => String(d.id) !== String(excludeDashboardId)) : items))
          .then(items => (isCancelled ? [] : setDashboards(items)))
          .catch(() => !isCancelled && setDashboards([]))
      : Promise.resolve().then(() => setDashboards([]));

    const queriesPromise = showQueries
      ? Query.query(commonParams)
          .then(({ results }) => results || [])
          .then(items => (excludeQueryId ? items.filter(q => String(q.id) !== String(excludeQueryId)) : items))
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

  const dashboardItems = useMemo(() => uniqBy((hasTags ? dashboards : dashboards.filter(d => !(d.tags && d.tags.length))), d => d.id), [dashboards, hasTags]);
  const queryItems = useMemo(() => uniqBy((hasTags ? queries : queries.filter(q => q.tags.length===0 )), q => q.id), [queries, hasTags]);

  const isEmpty = dashboardItems.length === 0 && queryItems.length === 0;

  // Scroll the active item into view when navigation changes active ids or list updates
  useEffect(() => {
    const container = containerRef.current;
    const activeEl = activeItemRef.current;
    if (!container || !activeEl) return;

    // Only adjust if not already fully visible
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const elemTop = activeEl.offsetTop;
    const elemBottom = elemTop + activeEl.offsetHeight;

    if (elemTop < containerTop || elemBottom > containerBottom) {
      // Center the active item for better context
      try {
        activeEl.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e) {
        // Fallback for older browsers
        container.scrollTop = Math.max(0, elemTop - container.clientHeight / 2);
      }
    }
  }, [activeDashboardId, activeQueryId, dashboardItems.length, queryItems.length]);

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
                ref={String(d.id) === String(activeDashboardId) ? activeItemRef : null}
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
                ref={String(q.id) === String(activeQueryId) ? activeItemRef : null}
                className={`rbts-item${String(q.id) === String(activeQueryId) ? " active" : ""}`.trim()}>
                <Link href={`queries/${q.id}`} title={q.name}>
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
  onReady: null,
  className: null,
};












