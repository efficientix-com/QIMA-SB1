/**
 * @copyright © 2018, Oracle and/or its affiliates. All rights reserved.
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(["exports", "N/task", "../models/setupComponentModel", "N"], function (_exports, _task, _setupComponentModel, _N) {
  "use strict";

  Object.defineProperty(_exports, "__esModule", {
    value: true
  });
  _exports.execute = void 0;
  var SETUP_COMPONENT = new _setupComponentModel.SetupComponentModel();

  var execute = function execute() {
    // find all that could be stuck (installing/uninstalling)
    var inProcessComponents = SETUP_COMPONENT.find({
      columns: ["taskId", "id"],
      filters: [SETUP_COMPONENT.filterColumns.status, "anyof", [_setupComponentModel.SetupComponentStatus.INSTALLING, _setupComponentModel.SetupComponentStatus.UNINSTALLING]]
    });

    _N.log.debug({
      title: "installing/uninstalling components found",
      details: inProcessComponents.length
    });

    inProcessComponents.forEach(function (component) {
      var taskId = component.taskId,
          id = component.id;

      if (taskId) {
        var status_1 = (0, _task.checkStatus)({
          taskId: taskId
        }).status;
        if (status_1 === _task.TaskStatus.PENDING || status_1 === _task.TaskStatus.PROCESSING) return;
      }

      SETUP_COMPONENT.save({
        id: id,
        status: _setupComponentModel.SetupComponentStatus.ERROR
      });
    });
  };

  _exports.execute = execute;
});