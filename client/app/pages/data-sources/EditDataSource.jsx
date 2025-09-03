import { get, find, toUpper } from "lodash";
import React from "react";
import PropTypes from "prop-types";

import Modal from "antd/lib/modal";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import navigateTo from "@/components/ApplicationArea/navigateTo";
import LoadingState from "@/components/items-list/components/LoadingState";
import DynamicForm from "@/components/dynamic-form/DynamicForm";
// 클론(복제) 시 생성 다이얼로그 재사용을 위해 추가
import CreateSourceDialog from "@/components/CreateSourceDialog";
import helper from "@/components/dynamic-form/dynamicFormHelper";
import HelpTrigger, { TYPES as HELP_TRIGGER_TYPES } from "@/components/HelpTrigger";
import wrapSettingsTab from "@/components/SettingsWrapper";

import DataSource, { IMG_ROOT } from "@/services/data-source";
import notification from "@/services/notification";
import routes from "@/services/routes";

class EditDataSource extends React.Component {
  static propTypes = {
    dataSourceId: PropTypes.string.isRequired,
    onError: PropTypes.func,
  };

  static defaultProps = {
    onError: () => {},
  };

  state = {
    dataSource: null,
    type: null,
    loading: true,
  };

  componentDidMount() {
    DataSource.get({ id: this.props.dataSourceId })
      .then(dataSource => {
        const { type } = dataSource;
        this.setState({ dataSource });
        DataSource.types().then(types => this.setState({ type: find(types, { type }), loading: false }));
      })
      .catch(error => this.props.onError(error));
  }

  componentWillUnmount() {
    // 열려 있는 클론 다이얼로그가 있으면 정리
    if (this.cloneDialog) {
      this.cloneDialog.dismiss();
      this.cloneDialog = null;
    }
  }

  saveDataSource = (values, successCallback, errorCallback) => {
    const { dataSource } = this.state;
    helper.updateTargetWithValues(dataSource, values);
    DataSource.save(dataSource)
      .then(() => successCallback("Saved."))
      .catch(error => {
        const message = get(error, "response.data.message", "Failed saving.");
        errorCallback(message);
      });
  };

  deleteDataSource = callback => {
    const { dataSource } = this.state;

    const doDelete = () => {
      DataSource.delete(dataSource)
        .then(() => {
          notification.success("Data source deleted successfully.");
          navigateTo("data_sources");
        })
        .catch(() => {
          callback();
        });
    };

    Modal.confirm({
      title: "Delete Data Source",
      content: "Are you sure you want to delete this data source?",
      okText: "Delete",
      okType: "danger",
      onOk: doDelete,
      onCancel: callback,
      maskClosable: true,
      autoFocusButton: null,
    });
  };

  // CreateSourceDialog에서 제출된 값으로 실제 Data Source 생성
  createDataSourceFromDialog = (selectedType, values) => {
    const target = { options: {}, type: selectedType.type };
    helper.updateTargetWithValues(target, values);
    return DataSource.create(target);
  };

  cloneDataSource = callback => {
    const { dataSource, type } = this.state;

    // 시크릿(비밀번호/파일 등) 필드는 API가 값을 반환하지 않으므로 그대로 복제할 수 없음
    // 폼 정의에서 password/file 타입을 찾아 사전 채움(prefill) 대상에서 제외
    const fields = helper.getFields(type, dataSource);
    const secretFieldNames = fields.filter(f => f.type === "password" || f.type === "file").map(f => f.name);

    const openCloneDialogWithName = name => {
      const clonedOptions = { ...dataSource.options };
      secretFieldNames.forEach(k => {
        if (k in clonedOptions) delete clonedOptions[k];
      });

      // 타입은 고정하고, 클론한 옵션(시크릿 제외)과 새 이름을 미리 채워 다이얼로그 오픈
      this.cloneDialog = CreateSourceDialog.showModal({
        types: [type],
        sourceType: "Data Source",
        imageFolder: IMG_ROOT,
        helpTriggerPrefix: "DS_",
        onCreate: this.createDataSourceFromDialog,
        defaultSelectedType: type,
        initialTarget: { name, options: clonedOptions },
      });

      this.cloneDialog
        .onClose((result = {}) => {
          this.cloneDialog = null;
          if (result.success) {
            notification.success("Data source cloned successfully."); // 생성 성공 안내
            if (secretFieldNames.length > 0) {
              notification.info(
                "Action Required:",
                "For security, secret fields (e.g., passwords, keys) were not copied. Please re-enter them.",
                { duration: 10 }
              );
            }
            navigateTo(`data_sources/${result.data.id}`);
          } else {
            callback();
          }
        })
        .onDismiss(() => {
          this.cloneDialog = null;
          callback();
        });
    };

    // 이름 중복 방지: “(copy)”, “(copy 2)” 등 접미사 부여
    DataSource.query()
      .then(items => {
        const existingNames = items.map(ds => ds.name);
        const base = dataSource.name || "Data Source";
        let candidate = `${base} (copy)`;
        if (existingNames.includes(candidate)) {
          let i = 2;
          while (existingNames.includes(`${base} (copy ${i})`)) i += 1;
          candidate = `${base} (copy ${i})`;
        }
        openCloneDialogWithName(candidate);
      })
      .catch(() => {
        const base = dataSource.name || "Data Source";
        openCloneDialogWithName(`${base} (copy)`);
      });
  };

  testConnection = callback => {
    const { dataSource } = this.state;
    DataSource.test({ id: dataSource.id })
      .then(httpResponse => {
        if (httpResponse.ok) {
          notification.success("Success");
        } else {
          notification.error("Connection Test Failed:", httpResponse.message, { duration: 10 });
        }
        callback();
      })
      .catch(() => {
        notification.error(
          "Connection Test Failed:",
          "Unknown error occurred while performing connection test. Please try again later.",
          { duration: 10 }
        );
        callback();
      });
  };

  renderForm() {
    const { dataSource, type } = this.state;
    const fields = helper.getFields(type, dataSource);
    const helpTriggerType = `DS_${toUpper(type.type)}`;
    const formProps = {
      fields,
      type,
      actions: [
        { name: "Clone", pullRight: true, disableWhenDirty: true, callback: this.cloneDataSource },
        { name: "Delete", type: "danger", callback: this.deleteDataSource },
        { name: "Test Connection", pullRight: true, callback: this.testConnection, disableWhenDirty: true },
      ],
      onSubmit: this.saveDataSource,
      feedbackIcons: true,
      defaultShowExtraFields: helper.hasFilledExtraField(type, dataSource),
    };

    return (
      <div className="row" data-test="DataSource">
        <div className="text-right m-r-10">
          {HELP_TRIGGER_TYPES[helpTriggerType] && (
            <HelpTrigger className="f-13" type={helpTriggerType}>
              Setup Instructions <i className="fa fa-question-circle" aria-hidden="true" />
              <span className="sr-only">(help)</span>
            </HelpTrigger>
          )}
        </div>
        <div className="text-center m-b-10">
          <img className="p-5" src={`${IMG_ROOT}/${type.type}.png`} alt={type.name} width="64" />
          <h3 className="m-0">{type.name}</h3>
        </div>
        <div className="col-md-4 col-md-offset-4 m-b-10">
          <DynamicForm {...formProps} />
        </div>
      </div>
    );
  }

  render() {
    return this.state.loading ? <LoadingState className="" /> : this.renderForm();
  }
}

const EditDataSourcePage = wrapSettingsTab("DataSources.Edit", null, EditDataSource);

routes.register(
  "DataSources.Edit",
  routeWithUserSession({
    path: "/data_sources/:dataSourceId",
    title: "Data Sources",
    render: pageProps => <EditDataSourcePage {...pageProps} />,
  })
);
