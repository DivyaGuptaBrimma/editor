define("ace/mode/sql_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules","ace/mode/fields","ace/mode/operators"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var Fields = require("./fields").Fields;
var Operators = require("./operators").Operators;

var SqlHighlightRules = function() {

    var fields = Fields.prototype.getFieldsRegEx();
    var fieldsRegEx = new RegExp(fields,'g');
    var values = Fields.prototype.getValuesRegEx();
    var valuesRegEx = new RegExp(values, 'g');
    var actions = Fields.prototype.getActionsRegEx();
    var actionsRegEx = new RegExp(actions, 'g');

    var builtinConstants = (
        "true|false"
    );

    var keywordMapper = this.createKeywordMapper({
        "fields": fields,
        "values": values,
        "actions": actions,
        "constant.language": builtinConstants,
    }, "identifier");

    this.$rules = {
        "start" : [
          {
            token: "field",
            regex: fieldsRegEx
          },
          {
            token: "when",
            regex: /when|WHEN/g
          },
          {
            token: "value",
            regex: valuesRegEx
          },
          {
            token: "action",
            regex: actionsRegEx
          },
          {
            token : "operator",
            regex : /is not equal to|is equal to|is before or equal to|is before|is after or equal to|is after|has any value|has no value|is less than or equal to|is less than|is greater than or equal to|is greater than|not in|in|does not contain|contains|does not end with|does not start with|ends with|is empty|is not empty|is not null|is null|starts with/g
          },
          {
            token: "join",
            regex: /and|or|AND|OR/g
          },
          {
            token: "then",
            regex: /then|THEN/g
          },
          {
            token : keywordMapper,
            regex : "[a-zA-Z_$][a-zA-Z0-9_$]*\\b"
          },
       ]

    };
    this.normalizeRules();
};

oop.inherits(SqlHighlightRules, TextHighlightRules);

exports.SqlHighlightRules = SqlHighlightRules;
});

define("ace/mode/rule",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/sql_highlight_rules","ace/mode/rule_completions","ace/worker/worker_client"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var SqlHighlightRules = require("./sql_highlight_rules").SqlHighlightRules;
var RuleCompletions = require("./rule_completions").RuleCompletions;
var WorkerClient = require("../worker/worker_client").WorkerClient;

var Mode = function(options) {
    this.HighlightRules = SqlHighlightRules;
    this.$behaviour = this.$defaultBehaviour;

    let fields = options.fields;
    let fieldsScore = options.fieldsScore;

    let operators = options.operators;
    let fieldLabelToID = options.fieldLabelToID;
    let actions = options.actions;
    let templateVariables = options.templateVariables;
    let exceptionID = options.exceptionID

    this.$completer = new RuleCompletions(
                                fields,
                                operators,
                                fieldLabelToID,
                                actions,
                                templateVariables,
                                fieldsScore,
                                exceptionID,
                              );
    // this.$completer = new PhpCompletions();
};
oop.inherits(Mode, TextMode);

(function() {

    this.lineCommentStart = "--";

    this.getCompletions = function(state, session, pos, prefix) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    };

    this.createWorker = function(session) {
        var worker = new WorkerClient(["ace"], "ace/mode/rule_worker", "RuleWorker");
        worker.attachToDocument(session.getDocument());

        worker.on("annotate", function(e) {
            session.setAnnotations(e.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    };

    this.$id = "ace/mode/rule";

}).call(Mode.prototype);

exports.Mode = Mode;

});


define("ace/mode/rule_completions",["require","exports","module","ace/mode/fields","ace/mode/operators"], function(require, exports, module) {
"use strict";

var Fields = require("./fields").Fields;
var Operators = require("./operators").Operators;

var RuleCompletions = function(fields, operators, fieldLabelToID, actions, templateVariables, fieldsScore, exceptionID) {
  Fields.prototype.fields = fields;
  Fields.prototype.fieldLabelToID = fieldLabelToID;
  Fields.prototype.fieldsScore = fieldsScore;

  Operators.prototype.operators = operators;

  Fields.prototype.actions = actions;

  this.actions = actions;

  this.fieldsString = Fields.prototype.getFieldsRegEx();
  this.fieldsRegEx = new RegExp(this.fieldsString,'g');

  this.templateVariables = templateVariables;
  this.exceptionID = exceptionID;

};

(function() {

    this.getCompletions = function(state, session, pos, prefix, callback) {
        var token = session.getTokenAt(pos.row, pos.column);

        var prevToken = session.getTokenAt(pos.row, token.start - 1);

        if(pos.column-2 < 0) {
          pos.row = pos.row - 1;
          prevToken = session.getTokenAt(pos.row);
          if(!prevToken) {
            return [{
              caption: 'when',
              value: 'when',
              // meta: 'field',
              score: Number.MAX_VALUE
            }];
          }
        }

        if (!token)
            return Fields.prototype.getAllFields();

        if(token.value.indexOf('@') > -1) {
          return this.templateVariables.map((variable) => {
            return {
              caption: variable,
              value: '{'+ variable + '}',
              // meta: "field",
              score: Number.MAX_VALUE
            }
          });
        }

        if(prevToken.type === 'field') {
          let prevPrevToken = session.getTokenAt(pos.row, prevToken.start-1);
          if(prevPrevToken && prevPrevToken.type === 'operator') {
            return this.getAllJoinOperators()
          }
        }

        if(prevToken.type === 'field') {
          let fieldId = Fields.prototype.getFieldIDFromLabel(prevToken.value);
          let prevPrevToken = session.getTokenAt(pos.row, prevToken.start-1);
          if(
            (prevPrevToken && prevPrevToken.type === 'join') ||
            (prevPrevToken.value == prevToken.value)) {
            return Operators.prototype.getAllOperators(fieldId);
          }
          if(prevPrevToken && prevPrevToken.type === 'action') {
            return this.getAllActions();
          }

          let findThen = session.getLines(0,pos.row).join(' ').indexOf('then');
          if(findThen > 4) {
            // return this.getAllActions();
            let actionArray = this.getAllActions();
            let lineNumber = pos.row;
            let line = session.getLines(lineNumber, lineNumber)[0];
            if(!line) {
              return actionArray;
            }
            let action = line.split("(")[0].trim();
            let actionObj = this.actions[action];
            if(!actionObj) {
              return actionArray;
            }

            let lineTillCurrentParam = line.substr(0, pos.column);
            let matches = lineTillCurrentParam.match(/,/g);
            let paramNumber = matches ? matches.length : 0;

            if(!actionObj.params) {
              return [];
            }

            let paramObject = actionObj.params[paramNumber];

            return Fields.prototype.getThenLookUpValues(paramObject);
          }

          return Operators.prototype.getAllOperators(fieldId);
        }

        if(prevToken.type === 'join') {
          return Fields.prototype.getAllFields();
        }

        if(prevToken.type === 'operator') {
          let prevPrevToken = session.getTokenAt(pos.row, prevToken.start-1);
          if(prevToken.value === 'is empty' || prevToken.value === 'is null' || prevToken.value === 'is not empty' || prevToken.value === 'is not null' ) {
            return this.getAllJoinOperators();
          }
          if(prevPrevToken && prevPrevToken.type === 'field') {
            return Fields.prototype.getValues(prevPrevToken.value);
          }
        }

        if(prevToken.type === 'value') {
          let prevPrevToken = session.getTokenAt(pos.row, prevToken.start-1);
          if(token.value ==', ' || token.value =='", ' || token.value ==', )' || token.value =='", )') {
            let fieldToken = session.getTokenAt(pos.row, prevPrevToken.start-1);
            while(fieldToken.type != 'field') {
              fieldToken = session.getTokenAt(pos.row, fieldToken.start-1);
            }
            return Fields.prototype.getValues(fieldToken.value);
          }

          if(token.value == '") ' || token.value == ') ' || token.value == '} ' || token.value == '}" ') {
            return this.getAllJoinOperators();
          }

          return this.getAllJoinOperators();
        }

        if(prevToken.type ==='text') {
          let findThen = session.getLines(0,pos.row).join(' ').indexOf('then');
          if(findThen > 4) {
            // return this.getAllActions();
            let actionArray = this.getAllActions();
            let lineNumber = pos.row;
            let line = session.getLines(lineNumber, lineNumber)[0];
            if(!line) {
              return actionArray;
            }
            let action = line.split("(")[0].trim();
            let actionObj = this.actions[action];
            if(!actionObj) {
              return actionArray;
            }

            let lineTillCurrentParam = line.substr(0, pos.column);
            let matches = lineTillCurrentParam.match(/,/g);
            let paramNumber = matches ? matches.length : 0;

            if(!actionObj.params) {
              return [];
            }

            let paramObject = actionObj.params[paramNumber];

            return Fields.prototype.getThenLookUpValues(paramObject);
          }

          let prevPrevToken = session.getTokenAt(pos.row, prevToken.start-1);
          if(prevPrevToken.type === 'operator') {
            return this.getAllJoinOperators();
          }

          if(token.value ==', )' || token.value =='", )') {
            let fieldToken = session.getTokenAt(pos.row, prevPrevToken.start-1);
            while(fieldToken.type != 'field') {
              fieldToken = session.getTokenAt(pos.row, fieldToken.start-1);
            }
            return Fields.prototype.getValues(fieldToken.value);
          }

          if(token.value == '") ' || token.value == ') ' || token.value == '} ' || token.value == '}" ' || token.value == ' ) ') {
            return this.getAllJoinOperators();
          }
        }

        if(prevToken.type ==='identifier') {
          if(token.value == '") ' || token.value == ') ' || token.value == '} ' || token.value == '}" '|| token.value == ' ) ') {
            return this.getAllJoinOperators();
          }
          let findThen = session.getLines(0, pos.row).join(' ').indexOf('then');

          if(findThen > 4) {

            let actionArray = this.getAllActions();
            let lineNumber = pos.row;
            let line = session.getLines(lineNumber, lineNumber)[0];
            if(!line) {
              return actionArray;
            }
            let action = line.split("(")[0].trim();
            let actionObj = this.actions[action];
            if(!actionObj) {
              return [];
            }

            let lineTillCurrentParam = line.substr(0, pos.column);
            let matches = lineTillCurrentParam.match(/,/g);
            let paramNumber = matches ? matches.length : 0;

            if(!actionObj.params) {
              return [];
            }

            let paramObject = actionObj.params[paramNumber];

            return Fields.prototype.getThenLookUpValues(paramObject);
          } else {
            // custom field keyed in
            return Operators.prototype.getAllOperators();
          }
        }

        if(prevToken.type === 'then') {
          return this.getAllActions();
        }

        if(prevToken.type === 'action') {
          if(!this.actions.param) {
            return;
          }
          if(prevToken.value === this.actions.param.label) {
            let ruleString = (session.getLines(0, session.getLength())).join(' ');
            let matches = ruleString.match(this.fieldsRegEx);
            matches = matches.filter(m=>m!="");
            matches = Array.from(new Set(matches));
            return matches.map((match) => {
              return {
                caption: match,
                value: match,
                // meta: "field",
                score: Number.MAX_VALUE
              }
            });
          }
        }

        if(prevToken.type === 'exception') {
          return this.getAllActions();
        }

        return Fields.prototype.getAllFields();
    };

    this.getAllJoinOperators = function () {
      return [
        {
          caption: 'and',
          value: 'and',
          // meta: "join operator",
          score: Number.MAX_VALUE
        }, {
          caption: 'or',
          value: 'or',
          // meta: "join operator",
          score: Number.MAX_VALUE
        }, {
          caption: 'then',
          value: 'then',
          // meta: "join operator",
          score: Number.MAX_VALUE
        }
      ];
    }

    this.getAllActions = function () {

      var actionIDs = Object.keys(this.actions);

      let actionsObj = actionIDs.map((aId) => {
        let params = this.actions[aId].params;
        let value = "";
        if(params && params.map) {
          value = params
                    .map(p => {
                      let paramString = p.type + '-' + p.name;
                      paramString = (p.type == "String" && !p.lookup) ? '"'+ paramString + '"' : paramString;
                      return paramString;
                    })
                    .join(", ");
        }
        return {
          caption: aId,
          value: aId + ' (' + value + ')',
        }
      });

      actionsObj.push({
        caption: 'Add All Input Parameters',
        value: 'Add All Input Parameters',
        // meta: 'action',
        score: Number.MAX_VALUE
      });

      return actionsObj;

    }

}).call(RuleCompletions.prototype);
exports.RuleCompletions = RuleCompletions;

});


define("ace/mode/fields",["require","exports","module"], function(require, exports, module) {
"use strict";

  var Fields = function(fields, fieldLabelToID, fieldsScore) {
    this.fields = fields;
    this.fieldLabelToID = fieldLabelToID;
    this.fieldsScore = fieldsScore;
  };

  (function() {

      this.getAllFields = function () {

        let fields = this.fields;
        let fieldKeys = Object.keys(fields);
        let totalFields = fieldKeys.length;

        return fieldKeys.map((fId) => {
          let sortRank = parseInt(fields[fId].sort);
          sortRank = sortRank ? sortRank : 0;

          sortRank = totalFields - sortRank;

          return {
            caption: fields[fId].label,
            value: fields[fId].label,
            // meta: f.alias,
            score: sortRank
          }
        });
      }

      this.getThenLookUpValues = function (paramObject) {
        if(!paramObject) {
          return [];
        }
        let lookup = paramObject.lookup;
        if(!lookup) {
          return [];
        }
        if(lookup.type == "Rule Input Metadata") {
          let dataTypes = lookup.data_type;
          let fields = [];
          fields.push(...(dataTypes.map(d =>  this.getFieldsByType(d))));
          fields = [].concat.apply([], fields);
          return fields;
        }
        if(lookup.values && lookup.values.map) {
          return lookup.values.map(l => {
            return {
              caption: l.label,
              value: l.id
            }
          });
        }

        return []
      }

      this.getValues = function (fieldLabel) {
        fieldLabel = fieldLabel.replace(/\[/g, "\\[");
        fieldLabel = fieldLabel.replace(/\]/g, "\\]");
        let fieldId = Fields.prototype.fieldLabelToID[fieldLabel];
        let fieldObj = Fields.prototype.fields[fieldId];
        let values = fieldObj ? fieldObj.values : undefined;
        if(fieldObj === undefined) {
          return this.getAllFields();
        }
        if(values === undefined || values === null) {
          return this.getFieldsByType(fieldObj.type);
        }
        if(fieldObj.type ==='boolean') {
          return [{
            caption: 'true',
            value: 'true',
            // meta: 'value',
            score: Number.MAX_VALUE
          },{
            caption: 'false',
            value: 'false',
            // meta: 'value',
            score: Number.MAX_VALUE
          }]
        }
        return Object.keys(values).map((vId) => {
          return {
            caption: values[vId].label ? values[vId].label : values[vId],
            value: values[vId].label ? '"' + values[vId].label + '"': '"' + values[vId]+ '"',
            // meta: 'value',
            score: Number.MAX_VALUE
          }
        });
      }

      this.getFieldsByType = function(type) {
        let keys = Object.keys(this.fields);
        keys = keys.filter((key) => {
          if(type === 'string') {
            return this.fields[key].type === 'string' && !this.fields[key].url;
          }
          return this.fields[key].type === type;
        });
        return keys.map((fId) => {
          return {
            caption: this.fields[fId].label,
            value: this.fields[fId].label,
            // meta: this.fieldsScore[fId] ? ("'" + this.fieldsScore[fId] + "'") : '0',
            score: this.fieldsScore[fId] ? this.fieldsScore[fId] : 0
          }
        });
      }

      this.getField = function (fieldID) {
        return this.fields[fieldID];
      }

      this.getFieldIDFromLabel = function (fieldID) {
        fieldID = fieldID.replace(/\[/g, '\\[');
        fieldID = fieldID.replace(/\]/g, '\\]');
        return this.fieldLabelToID[fieldID];
      }

      this.getFieldsRegEx = function () {
        let fields = this.fields;
        let reg = Object.keys(fields)
                    .reduce((reg, fId, array) => fields[fId].label+'|'+reg, '');
        reg = reg.replace(/\[/g, '\\[');
        reg = reg.replace(/\]/g, '\\]');
        return reg;
      }

      this.getValuesRegEx = function () {
        let fields = this.fields;
        let reg = '';
        let fieldsWithValues = Object.keys(this.fields).filter((fId) => {
          return (this.fields[fId].values != undefined)
        });
        let values = fieldsWithValues.map(fId => {
          return this.fields[fId].values;
        });

        let valueLabels =  [];
        valueLabels = values.reduce((valueLabels,t)=>{
          valueLabels.push(...Object.keys(t).map(t1 => t[t1]));
          return valueLabels;
        }, valueLabels);

        valueLabels = valueLabels.sort((a, b) => b.length - a.length);

        let joinedValues = valueLabels.join('|');
        joinedValues = joinedValues.replace(/\(/g, "\\(");
        joinedValues = joinedValues.replace(/\)/g, "\\)");

        return joinedValues;
      }

      this.getActionsRegEx = function () {
        let actions = this.actions;
        let reg = '';
        reg = Object.keys(actions)
                .reduce((reg, aId, array) => actions[aId].label+'|'+reg, reg);
        reg = 'Add All Input Parameters|' + reg;
        return reg;

      }

      this.$id = "ace/mode/fields";

}).call(Fields.prototype);

exports.Fields = Fields;

});


define("ace/mode/operators",["require","exports","module","ace/mode/fields"], function(require, exports, module) {
"use strict";

    var Fields = require("./fields").Fields;

    var Operators = function(operators) {
      this.operators = operators;
    };

    (function() {

      this.getAllOperators = function (fieldId){
        let field = Fields.prototype.getField(fieldId);
        if(!field) {
          /* Operators depends on type of field */
          /* by default string operators are returned */
          field = { type: 'int' };
          // return;
        }
        let fieldType = field.url !== undefined ? 'options' : field.type;
        fieldType = fieldType ? fieldType.toLowerCase() : fieldType;
        fieldType = fieldType ? fieldType : 'string';
        let operators = this.operators[fieldType];
        if(!operators) {
          return;
        }
        return Object.keys(operators).map((oId) => {
          let value = operators[oId].num_inputs == null
                          ? operators[oId].label + ' ('
                          : operators[oId].label;
          return {
            caption: operators[oId].label,
            value: value,
            // meta: fieldType + ' operator',
            score: Number.MAX_VALUE
          }
        });
      }

    }).call(Operators.prototype);

    exports.Operators = Operators;

  });
