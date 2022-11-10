/**
 * Copyright © 2017, 2020 Oracle and/or its affiliates.
 *
 * @NAPIVersion 2.1
 * @NScriptType ScheduledScript
 */
define([
    '../adapter/fam_adapter_file',
    '../adapter/fam_adapter_format',
    '../adapter/fam_adapter_runtime',
    '../adapter/fam_adapter_search',
    '../adapter/fam_adapter_task',
    '../const/fam_const_customlist',
    '../util/fam_util_process',
    '../util/fam_util_summaryhash',
    '../util/fam_util_systemsetup'
],

function(file, format, runtime, search, task, constList, utilProcess, utilSummaryHash, utilSetup) {
    var module = {
        filePrefix : 'chkSummary-',
        fileSizeLimit : 10 * 1000000 // 10MB
    };

    module.timer = {
        startTime: null,
        limit: 2700000, // 45 mins
        start: function() {
            this.startTime = new Date().getTime();
        },
        hasElapsed: function() {
            if (!this.startTime) {
                this.startTime = new Date().getTime();
            }
            var remainingTime = this.limit - (new Date().getTime() - this.startTime);
            log.debug('remaining time (ms) before restart', remainingTime);

            return (remainingTime <= 0);
        }
   };

   module.governance = {
        limit: 1000,
        hasExceeded: function() {
            var remainingUsage = runtime.getCurrentScript().getRemainingUsage() - this.limit;
            log.debug('remaining usage before restart', remainingUsage);
            return (remainingUsage <= 0);
        }
   };

   module.getDHRPagedData = function(params) {
       var pagedData = null;

       var searchObj = this.buildDHRSearchObj(params)
       if (searchObj) {
           var startTime = new Date().getTime();
           log.debug('Dhr search', 'start');
           pagedData = searchObj.runPaged({pageSize : 1000});
           log.debug('Dhr search', 'runPaged in ms: ' + (new Date().getTime() - startTime));
           if (pagedData) {
               log.debug('Search results', pagedData.count);
               log.debug('Number of pages', pagedData.pageRanges.length);
           }
       }
       return pagedData;
   };

   module.buildDHRSearchObj = function(params){
       var searchObj = search.load({
           id: 'customsearch_fam_dhr_name'
       });
       searchObj.filterExpression = searchObj.filterExpression.concat([
           'AND', ['name', search.getOperator('ISNOTEMPTY'),''],
           'AND', ['name', search.getOperator('DOESNOTCONTAIN'),'dhr-default-name']
       ]);
       if (params){
           if (params.subs && params.subs.length) {
               searchObj.filterExpression = searchObj.filterExpression.concat([
                   'AND', ['custrecord_deprhistsubsidiary', search.getOperator('ANYOF'),params.subs]
               ]);
           }
           if (params.books && params.books.length) {
               searchObj.filterExpression = searchObj.filterExpression.concat([
                   'AND', ['custrecord_deprhistaccountingbook', search.getOperator('ANYOF'),params.books]
               ]);
           }
           if (params.assetTypes && params.assetTypes.length) {
               searchObj.filterExpression = searchObj.filterExpression.concat([
                   'AND', ['custrecord_deprhistassettype', search.getOperator('ANYOF'),params.assetTypes]
               ]);
           }
           if (params.date) {
               searchObj.filterExpression = searchObj.filterExpression.concat([
                   'AND', ['custrecord_deprhistdate', search.getOperator('ONORBEFORE'),params.date]
               ]);
           }
       }

       return searchObj;
   };

   module.getSummaryFilters = function(dhrResults) {
       var filters = {
           depts: [],
           classes: [],
           locations: [],
           projects: [],
           deprAccts: [],
           chargeAccts: [],
           date: null
       };
       if (dhrResults) {
           dhrResults.forEach(function(dhrRes) {
               var dhrName = dhrRes.getValue({ name: 'name' , summary: 'group' });
               if (utilSummaryHash.isValidHashFieldCount(dhrName)){
                   var hashObj = utilSummaryHash.parseHashValue(dhrName);
                   if (hashObj.depId && filters.depts.indexOf(hashObj.depId) === -1) {
                       filters.depts.push(hashObj.depId);
                   }
                   if (hashObj.classId && filters.classes.indexOf(hashObj.classId) === -1) {
                       filters.classes.push(hashObj.classId);
                   }
                   if (hashObj.locId && filters.locations.indexOf(hashObj.locId) === -1) {
                       filters.locations.push(hashObj.locId);
                   }
                   if (hashObj.projectId && filters.projects.indexOf(hashObj.projectId) === -1) {
                       filters.projects.push(hashObj.projectId);
                   }
                   if (hashObj.depAcct && filters.deprAccts.indexOf(hashObj.depAcct) === -1) {
                       filters.deprAccts.push(hashObj.depAcct);
                   }
                   if (hashObj.chargeAcct && filters.chargeAccts.indexOf(hashObj.chargeAcct) === -1) {
                       filters.chargeAccts.push(hashObj.chargeAcct);
                   }
                   if (hashObj.periodDate && hashObj.periodDate.getTime && (!filters.date || (filters.date.getTime && filters.date.getTime() < hashObj.periodDate.getTime))) {
                       filters.date = hashObj.periodDate;
                   }
               }
           });
       }
       return filters;
   };

   module.searchSummaries = function(summaryFilters) {
       var summaries = null;
       if (summaryFilters) {
           var filters = [];
           if (summaryFilters.subs && summaryFilters.subs.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_subsidiary', operator: 'anyof', values: summaryFilters.subs }));
           }
           if (summaryFilters.books && summaryFilters.books.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_accountingbook', operator: 'anyof', values: summaryFilters.books }));
           }
           if (summaryFilters.assetTypes && summaryFilters.assetTypes.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_assettype', operator: 'anyof', values: summaryFilters.assetTypes }));
           }
           if (summaryFilters.depts && summaryFilters.depts.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_department', operator: 'anyof', values: summaryFilters.depts }));
           }
           if (summaryFilters.classes && summaryFilters.classes.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_class', operator: 'anyof', values: summaryFilters.classes }));
           }
           if (summaryFilters.locations && summaryFilters.locations.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_location', operator: 'anyof', values: summaryFilters.locations }));
           }
           if (summaryFilters.projects && summaryFilters.projects.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_project', operator: 'anyof', values: summaryFilters.projects }));
           }
           if (summaryFilters.deprAccts && summaryFilters.deprAccts.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_depracc', operator: 'anyof', values: summaryFilters.deprAccts }));
           }
           if (summaryFilters.chargeAccts && summaryFilters.chargeAccts.length > 0) {
               filters.push(search.createFilter({ name: 'custrecord_summary_chargeacc', operator: 'anyof', values: summaryFilters.chargeAccts }));
           }
           if (summaryFilters.date) {
               filters.push(search.createFilter({ name: 'custrecord_summary_deprdate', operator: 'onorafter', values: format.format({ value: summaryFilters.date, type: format.getType('DATE') }) }));
           }
           if (summaryFilters.endDate) {
               filters.push(search.createFilter({ name: 'custrecord_summary_deprdate', operator: 'onorbefore', values: summaryFilters.endDate }));
           }
           filters.push(search.createFilter({ name: 'isinactive', operator: 'is', values: false }));

           var searchObj = search.create({
               type: 'customrecord_bg_summaryrecord',
               filters: filters,
               columns: [search.createColumn({ name: 'name', summary: 'group' })]
           });

           var searchRes = searchObj.run().getRange(0, 1000); // result is always < 1000
           summaries = [];
           searchRes.forEach(function(summaryObj) {
               summaries.push(summaryObj.getValue({ name: 'name' , summary: 'group' }));
           });
       }

       return summaries;
   };

   module.getMissingSummaries = function(dhrResults, summaryResults) {
       var summariesToCreate = [];
       if (dhrResults && summaryResults) {
           dhrResults.forEach(function(dhrRes) {
               var dhrName = dhrRes.getValue({ name: 'name' , summary: 'group' });
               if (summaryResults.indexOf(dhrName) === -1) {
                   summariesToCreate.push(dhrName);
               }
           });
       }
       return summariesToCreate;
   };

    /**
     * Definition of the Scheduled script trigger point.
     *
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed. It is one of the values from the scriptContext.InvocationType enum.
     * @Since 2015.2
     */
    module.execute = function(scriptContext) {
        var fprId = runtime.getCurrentScript().getParameter({ name: 'custscript_checksummaries_fprid' });
        var paramsStr = runtime.getCurrentScript().getParameter({ name: 'custscript_checksummaries_params' });
        log.debug('Params', paramsStr);
        var currPage = runtime.getCurrentScript().getParameter({ name: 'custscript_checksummaries_currpage' }) || 0;
        log.debug('Current page', currPage);
        var filesList = runtime.getCurrentScript().getParameter({ name: 'custscript_checksummaries_list' });
            filesList = filesList ? filesList.split(',') : [];
        log.debug('Summary files list, length:'+filesList.length, filesList);

        var summariesToCreate = [];
        this.timer.start();
        utilProcess.Stage.start({fprId: fprId});

        var restartFlag = false;
        var errors = [];

        try {
            var params = null;
            if (paramsStr) {
                params = JSON.parse(paramsStr);
            }
            var pagedData = this.getDHRPagedData(params);

            if (pagedData && pagedData.count > 0 && currPage < pagedData.pageRanges.length) {
                for (var i = currPage; i < pagedData.pageRanges.length; i++) {
                    // Governance check
                    if (!this.timer.hasElapsed() && !this.governance.hasExceeded()) {
                        var startTime = new Date().getTime();
                        var dhrResults = pagedData.fetch({ index : i });
                        log.debug('Dhr search', 'fetch (' + i + ') in ms: ' + (new Date().getTime() - startTime));
                        var summaryFilters = this.getSummaryFilters(dhrResults.data);
                        summaryFilters.subs = params.subs || [];
                        summaryFilters.books = params.books || [];
                        summaryFilters.assetTypes = params.assetTypes || [];
                        summaryFilters.endDate = params.date;

                        var summaryResults = this.searchSummaries(summaryFilters);
                        summariesToCreate = summariesToCreate.concat(this.getMissingSummaries(dhrResults.data, summaryResults));
                        currPage++;
                    }
                    else {
                        restartFlag = true;
                        break;
                    }
                }
            }
        } catch(ex) {
            log.error('exception occurred', ex);
            errors.push({ error: ex });
        }

        this.saveFile(fprId, summariesToCreate, filesList);
        if (restartFlag) {
            log.audit('Time/usage limit reached', 'Restarting script');
            // restart with params
            var scriptParams = {
                custscript_checksummaries_fprid: fprId,
                custscript_checksummaries_params: paramsStr,
                custscript_checksummaries_currpage: currPage,
                custscript_checksummaries_list: filesList.join(',')
            };
            var scriptTask = task.create({ taskType : task.getTaskType().SCHEDULED_SCRIPT });
            scriptTask.scriptId = 'customscript_fam_checksummaries_ss';
            scriptTask.deploymentId = 'customdeploy_fam_checksummaries_ss';
            scriptTask.params = scriptParams;
            var procId = scriptTask.submit();
            log.audit('Script Restarted', 'Process ID: ' + procId +
                    ' | Params: ' + JSON.stringify(scriptTask.params));
        }
        else {
            utilProcess.Stage.end({
                fprId : fprId,
                errors : errors,
                outputResult : filesList.length,
                params : { files: filesList, done: 'T' },
                status : errors.length > 0 ? constList.ProcStageStatus.CompletedWithErrors : constList.ProcStageStatus.Completed
            });

            var procId = utilProcess.Control.callProcessManager();
            log.audit('Triggering Process Manager', 'Process ID: ' + procId);
        }
    };

    module.saveFile = function(fprId, summariesToCreate, filesList){
        if (summariesToCreate.length == 0){
            log.debug('No contents to save', 'FPR: ' + fprId);
            return;
        }
        var summariesToCreateStr = summariesToCreate.join(',');
        var lastFileIdx = filesList.length ? filesList.length-1: 0,
            strStart = 0,
            strEnd = 0;

        if (filesList.length){
            var lastFileObj = null,
                fileId = filesList[lastFileIdx++];
            try{
                lastFileObj = file.load({id:fileId});
            }
            catch(e){
                log.error('saveFile - Unable to load file with ID: ' + fileId, e);
            }

            if (lastFileObj){
                var lastFileContents = lastFileObj.getContents();
                var remCapacity = this.fileSizeLimit-lastFileContents.length-1;
                if (remCapacity > 0){
                    var ret = this.saveFileContent({
                        strSetLowerIdx : strStart,
                        strSetUpperIdx : remCapacity,
                        strSubSetLimit : remCapacity,
                        strInputEndIdx : strEnd,
                        fprId : fprId,
                        summariesToCreateStr : summariesToCreateStr,
                        fileObj : lastFileObj
                    });
                    strEnd = ret.strInputEndIdx;
                }
            }
        }

        while(strEnd < summariesToCreateStr.length){
            strStart = strEnd;
            var strSetUpperIdx = this.fileSizeLimit+strStart;
            var ret = this.saveFileContent({
                strSetLowerIdx : strStart,
                strSetUpperIdx : strSetUpperIdx,
                strSubSetLimit : this.fileSizeLimit,
                strInputEndIdx : strEnd,
                fprId : fprId,
                summariesToCreateStr : summariesToCreateStr,
                lastFileIdx : ++lastFileIdx
            });

            if (ret.fileId && filesList.indexOf(ret.fileId) == -1) filesList.push(ret.fileId);
            strEnd = ret.strInputEndIdx;
        }

        return filesList;
    };

    module.saveFileContent = function(options){
        log.debug('saveFileContent options', options);
        var summariesToCreateStr = options.summariesToCreateStr,
            fileObj = options.fileObj,
            fprId = options.fprId,
            strInputEndIdx = options.strInputEndIdx,
            strSetLowerIdx = options.strSetLowerIdx,
            strSetUpperIdx = options.strSetUpperIdx,
            strSubSetLimit = options.strSubSetLimit;

        var fileId = 0,
            strContents = '',
            lastCharIdx = 0;

        var strSet = summariesToCreateStr.substring(strSetLowerIdx, strSetUpperIdx);
        if (fileObj && strSubSetLimit >= (summariesToCreateStr.length-strSet.length)){
            lastCharIdx = strSetUpperIdx;
            strInputEndIdx  += lastCharIdx ? lastCharIdx-1 : 0;
        }
        else if (!fileObj && strSubSetLimit >= (summariesToCreateStr.length-strSetLowerIdx)){
            lastCharIdx = summariesToCreateStr.length;
            strInputEndIdx  += lastCharIdx ? lastCharIdx-1 : 0;
        }
        else{
            lastCharIdx = strSet.lastIndexOf(',');
            strInputEndIdx  += lastCharIdx;
        }

        if (lastCharIdx > 0){
            strContents = strSet.substring(0, lastCharIdx);
        }
        if (strContents.length > 0) {
            if (fileObj){
                strContents = ','+strContents;
                fileObj.appendLine({value:strContents});
            }
            else{
                var folder = utilSetup.getSetting('famFilesFolder');
                var lastFileIdx = options.lastFileIdx;
                var strFileCount = lastFileIdx<100 ? ('00'+lastFileIdx).slice(-3) : lastFileIdx;
                var filename = this.filePrefix + fprId + '_' + strFileCount + '.txt';

                fileObj = file.create({
                    name: filename,
                    fileType: file.getType('PLAINTEXT'),
                    contents: strContents,
                    folder: folder
                });
            }
            fileId = fileObj.save();
            strInputEndIdx += 1;
        }

        return {
            fileId : fileId,
            strInputEndIdx : strInputEndIdx
        }
    };

    return module;

});
