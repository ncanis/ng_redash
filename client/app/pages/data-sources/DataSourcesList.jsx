import { isEmpty, reject } from "lodash";
import React from "react";
import PropTypes from "prop-types";

import Button from "antd/lib/button";
import Modal from "antd/lib/modal";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import navigateTo from "@/components/ApplicationArea/navigateTo";
// 테이블 UI로 전환하기 위해 Ant Design Table/Link 사용
import Table from "antd/lib/table";
import Link from "@/components/Link";
import LoadingState from "@/components/items-list/components/LoadingState";
import CreateSourceDialog from "@/components/CreateSourceDialog";
import DynamicComponent, { registerComponent } from "@/components/DynamicComponent";
import helper from "@/components/dynamic-form/dynamicFormHelper";
import wrapSettingsTab from "@/components/SettingsWrapper";
import PlainButton from "@/components/PlainButton";

import DataSource, { IMG_ROOT } from "@/services/data-source";
import { policy } from "@/services/policy";
import recordEvent from "@/services/recordEvent";
import routes from "@/services/routes";
import notification from "@/services/notification";

export function DataSourcesListComponent({ dataSources, onClickCreate, onClone, onDelete }) {
  // 데이터 소스가 없을 때: 기존 빈 상태 유지
  if (isEmpty(dataSources)) {
    return (
      <div className="text-center">
        There are no data sources yet.
        {policy.isCreateDataSourceEnabled() && (
          <div className="m-t-5">
            <PlainButton type="link" onClick={onClickCreate} data-test="CreateDataSourceLink">
              Click here
            </PlainButton>{" "}
            to add one.
          </div>
        )}
      </div>
    );
  }

  // Grid(CardsList) 대신 Table 컬럼 정의
  // 주의: 생성시간(created_at)은 서버에서 제공하지 않아 제외함
  const columns = [
    {
      title: "",
      dataIndex: "type",
      key: "icon",
      width: 48,
      // 데이터 소스 타입 아이콘
      render: type => <img src={`${IMG_ROOT}/${type}.png`} alt={type} width="24" />,
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      // 이름 기준 정렬 및 상세(Edit) 페이지 링크
      sorter: (a, b) => (a.name || "").localeCompare(b.name || ""),
      render: (name, record) => <Link href={`data_sources/${record.id}`}>{name}</Link>,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      // 타입 문자열 정렬
      sorter: (a, b) => (a.type || "").localeCompare(b.type || ""),
      render: type => <span className="monospace">{type}</span>,
    },
    {
      title: "Clone",
      key: "clone",
      width: 110,
      render: (_, record) => (
        <Button size="small" onClick={() => onClone && onClone(record)} data-test={`CloneDataSource${record.id}`}>
          Clone
        </Button>
      ),
    },
    {
      title: "Delete",
      key: "delete",
      width: 110,
      render: (_, record) => (
        <Button size="small" danger onClick={() => onDelete && onDelete(record)} data-test={`DeleteDataSource${record.id}`}>
          Delete
        </Button>
      ),
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      // ID 숫자 정렬
      sorter: (a, b) => (a.id || 0) - (b.id || 0),
      width: 100,
    },
  ];

  return (
    // 표 형태로 목록 표시 (페이지네이션 포함)
    <Table
      size="middle"
      rowKey={record => record.id}
      dataSource={dataSources}
      columns={columns}
      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
    />
  );
}

registerComponent("DataSourcesListComponent", DataSourcesListComponent);

class DataSourcesList extends React.Component {
  static propTypes = {
    isNewDataSourcePage: PropTypes.bool,
    onError: PropTypes.func,
  };

  static defaultProps = {
    isNewDataSourcePage: false,
    onError: () => {},
  };

  state = {
    dataSourceTypes: [],
    dataSources: [],
    loading: true,
  };

  newDataSourceDialog = null;
  cloneDialog = null;

  componentDidMount() {
    Promise.all([DataSource.query(), DataSource.types()])
      .then(values =>
        this.setState(
          {
            dataSources: values[0],
            dataSourceTypes: values[1],
            loading: false,
          },
          () => {
            // all resources are loaded in state
            if (this.props.isNewDataSourcePage) {
              if (policy.canCreateDataSource()) {
                this.showCreateSourceDialog();
              } else {
                navigateTo("data_sources", true);
              }
            }
          }
        )
      )
      .catch(error => this.props.onError(error));
  }

  componentWillUnmount() {
    if (this.newDataSourceDialog) {
      this.newDataSourceDialog.dismiss();
    }
    if (this.cloneDialog) {
      this.cloneDialog.dismiss();
    }
  }

  createDataSource = (selectedType, values) => {
    // NGBE_GAME 체크 시 동일 옵션으로 3개의 DS 생성
    const { ngbe_game, name: baseName, ...restValues } = values;
    const targetBase = { options: {}, type: selectedType.type };
    // ngbe_game 플래그는 options에 포함하지 않음
    helper.updateTargetWithValues(targetBase, { name: baseName, ...restValues });

    if (ngbe_game) {
      const suffixes = ["BASIC_VIEW", "MKT_VIEW", "REV_VIEW"];
      const createOne = suffix => {
        const t = {
          ...targetBase,
          options: { ...targetBase.options },
          type: targetBase.type,
          name: `${baseName}_${suffix}`,
        };
        return DataSource.create(t);
      };
      this.setState({ loading: true });
      return Promise.all(suffixes.map(createOne)).then(results => {
        // 목록 갱신
        return DataSource.query().then(dataSources => {
          this.setState({ dataSources, loading: false });
          // 첫 번째 생성 결과 반환 (다이얼로그 닫힘용)
          return results[0];
        });
      });
    }

    const target = targetBase;
    return DataSource.create(target).then(dataSource => {
      this.setState({ loading: true });
      DataSource.query().then(dataSources => this.setState({ dataSources, loading: false }));
      return dataSource;
    });
  };

  showCreateSourceDialog = () => {
    recordEvent("view", "page", "data_sources/new");
    this.newDataSourceDialog = CreateSourceDialog.showModal({
      types: reject(this.state.dataSourceTypes, "deprecated"),
      sourceType: "Data Source",
      imageFolder: IMG_ROOT,
      helpTriggerPrefix: "DS_",
      onCreate: this.createDataSource,
    });

    this.newDataSourceDialog
      .onClose((result = {}) => {
        this.newDataSourceDialog = null;
        if (result.success) {
          navigateTo(`data_sources/${result.data.id}`);
        }
      })
      .onDismiss(() => {
        this.newDataSourceDialog = null;
        navigateTo("data_sources", true);
      });
  };

  onDeleteDataSource = dataSource => {
    const doDelete = () => {
      DataSource.delete(dataSource)
        .then(() => {
          notification.success("Data source deleted successfully.");
          this.setState({ loading: true });
          DataSource.query().then(dataSources => this.setState({ dataSources, loading: false }));
        })
        .catch(() => {
          notification.error("Failed deleting data source.");
        });
    };

    Modal.confirm({
      title: "Delete Data Source",
      content: `Are you sure you want to delete "${dataSource.name}"?`,
      okText: "Delete",
      okType: "danger",
      onOk: doDelete,
      maskClosable: true,
      autoFocusButton: null,
    });
  };

  onCloneDataSource = dataSource => {
    const type = this.state.dataSourceTypes.find(t => t.type === dataSource.type);
    if (!type) return;

    // Fetch full data source to get options (list view may not include them)
    DataSource.get({ id: dataSource.id })
      .then(fullDS => {
        const fields = helper.getFields(type, fullDS);
        const secretFieldNames = fields
          .filter(f => f.type === "password" || f.type === "file")
          .map(f => f.name);

        const clonedOptions = { ...(fullDS.options || {}) };
        secretFieldNames.forEach(k => {
          if (k in clonedOptions) delete clonedOptions[k];
        });

        const base = fullDS.name || "Data Source";
        const existingNames = this.state.dataSources.map(ds => ds.name);
        let candidate = `${base} (copy)`;
        if (existingNames.includes(candidate)) {
          let i = 2;
          while (existingNames.includes(`${base} (copy ${i})`)) i += 1;
          candidate = `${base} (copy ${i})`;
        }

        this.cloneDialog = CreateSourceDialog.showModal({
          types: [type],
          sourceType: "Data Source",
          imageFolder: IMG_ROOT,
          helpTriggerPrefix: "DS_",
          onCreate: this.createDataSource,
          defaultSelectedType: type,
          initialTarget: { name: candidate, options: clonedOptions },
        });

        this.cloneDialog
          .onClose((result = {}) => {
            this.cloneDialog = null;
            if (result.success) {
              notification.success("Data source cloned successfully.");
            }
          })
          .onDismiss(() => {
            this.cloneDialog = null;
          });
      })
      .catch(() => {
        notification.error("Failed to load data source for cloning.");
      });
  };

  render() {
    const newDataSourceProps = {
      type: "primary",
      onClick: policy.isCreateDataSourceEnabled() ? this.showCreateSourceDialog : null,
      disabled: !policy.isCreateDataSourceEnabled(),
      "data-test": "CreateDataSourceButton",
    };

    return (
      <div>
        <div className="m-b-15">
          <Button {...newDataSourceProps}>
            <i className="fa fa-plus m-r-5" aria-hidden="true" />
            New Data Source
          </Button>
          <DynamicComponent name="DataSourcesListExtra" />
        </div>
        {this.state.loading ? (
          <LoadingState className="" />
        ) : (
          <DynamicComponent
            name="DataSourcesListComponent"
            dataSources={this.state.dataSources}
            onClickCreate={this.showCreateSourceDialog}
            onClone={this.onCloneDataSource}
            onDelete={this.onDeleteDataSource}
          />
        )}
      </div>
    );
  }
}

const DataSourcesListPage = wrapSettingsTab(
  "DataSources.List",
  {
    permission: "admin",
    title: "Data Sources",
    path: "data_sources",
    order: 1,
  },
  DataSourcesList
);

routes.register(
  "DataSources.List",
  routeWithUserSession({
    path: "/data_sources",
    title: "Data Sources",
    render: pageProps => <DataSourcesListPage {...pageProps} />,
  })
);
routes.register(
  "DataSources.New",
  routeWithUserSession({
    path: "/data_sources/new",
    title: "Data Sources",
    render: pageProps => <DataSourcesListPage {...pageProps} isNewDataSourcePage />,
  })
);
