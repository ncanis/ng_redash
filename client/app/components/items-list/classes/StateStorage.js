import { defaults } from "lodash";
import { clientConfig } from "@/services/auth";
import location from "@/services/location";
import { parse as parseOrderBy, compile as compileOrderBy } from "./Sorter";

export class StateStorage {
  constructor(state = {}) {
    this._state = { ...state };
  }

  getState() {
    return defaults(this._state, {
      page: 1,
      itemsPerPage: clientConfig.pageSize,
      orderByField: "created_at",
      orderByReverse: false,
      searchTerm: "",
      // 선택된 태그(과거 호환을 위해 tags도 남겨둠)
      selectedTags: [],
      tags: [],
    });
  }

  // eslint-disable-next-line class-methods-use-this
  setState() {}
}

export class UrlStateStorage extends StateStorage {
  getState() {
    const defaultState = super.getState();
    const params = location.search;

    const searchTerm = params.q || "";

    // in search mode order by should be explicitly specified in url, otherwise use default
    const defaultOrderBy =
      searchTerm !== "" ? "" : compileOrderBy(defaultState.orderByField, defaultState.orderByReverse);

    const { field: orderByField, reverse: orderByReverse } = parseOrderBy(params.order || defaultOrderBy);

    // URL 쿼리에서 태그를 복원 (tags=a&tags=b 또는 tags=a,b 모두 지원)
    let selectedTags = [];
    const tagsParam = params.tags;
    if (Array.isArray(tagsParam)) {
      selectedTags = tagsParam;
    } else if (typeof tagsParam === "string") {
      selectedTags = tagsParam.split(",").filter(Boolean);
    }

    return {
      page: parseInt(params.page, 10) || defaultState.page,
      itemsPerPage: parseInt(params.page_size, 10) || defaultState.itemsPerPage,
      orderByField,
      orderByReverse,
      searchTerm,
      selectedTags,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  setState({ page, itemsPerPage, orderByField, orderByReverse, searchTerm, selectedTags }) {
    location.setSearch(
      {
        page,
        page_size: itemsPerPage,
        order: compileOrderBy(orderByField, orderByReverse),
        q: searchTerm !== "" ? searchTerm : null,
        // 태그를 URL에 보관하여 뒤로가기 시에도 유지되도록 함
        tags: Array.isArray(selectedTags) && selectedTags.length ? selectedTags : null,
      },
      true
    );
  }
}
