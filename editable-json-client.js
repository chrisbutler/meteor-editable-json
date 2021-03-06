if (_.isUndefined(EditableJSON)) {
  EditableJSON = {};
}

// Call back queues
EditableJSON._afterUpdateCallbacks = [];
EditableJSON._onUnpublishedFieldAddedCallbacks = [];

EditableJSON._runCallbacks = function () {
  // arguments should be:
  // arguments[0] = EditableJSON._afterUpdateCallbacks; // i.e. the array of callback functions to call
  // arguments[1] = context; // i.e. the thing that will be `this` in the function that gets called
  // arguments[2 ...] = arguments; // i.e. the arguments of the function that will be called
  var args = Array.prototype.slice.call(arguments);
  var callbackArray = args.shift();
  var context = args.shift();
  _.each(callbackArray, function (c) {
    if (_.isUndefined(c.store) || c.store === args[0]) {
      if (_.isFunction(c.callback)) {
        c.callback.apply(context,args);
      }
      else {
        console.log("Callbacks must be a functions. A " + (typeof c.callback) + " was passed instead.");
      }
    }
  });
}

EditableJSON.onUnpublishedFieldAdded = function (callback, store) {
  EditableJSON._onUnpublishedFieldAddedCallbacks.push({callback: callback, store: store});
};

EditableJSON.afterUpdate = function (callback, store) {
  EditableJSON._afterUpdateCallbacks.push({callback: callback, store: store});
};

// Internal methods
// Shouldn't be called from app or package code

EditableJSONStore = new ReactiveDict();

EditableJSONInternal = {};

EditableJSONInternal.timer = null;

EditableJSONInternal.resize = function (elem) {
  var el = $(elem);
  EditableJSONInternal.editing_key_press.fakeEl.text(el.val());
  var width = EditableJSONInternal.editing_key_press.fakeEl.width() + 8;
  el.width(width);
  el.css('min-width',width);    
}

EditableJSONInternal.editing_key_press = function (elem,noDelay) {
  if (EditableJSONInternal.editing_key_press.fakeEl === undefined) {
    EditableJSONInternal.editing_key_press.fakeEl = $('<span class="editable-JSON-input">').hide().appendTo(document.body);
  }
  if (noDelay) {
    var input = elem.find('input');
    EditableJSONInternal.resize(input);
    input.select();
  }
  else {
    Meteor.defer(function () {
      EditableJSONInternal.resize(elem);
    });
  }
}

EditableJSONInternal.getContext = function () {
  var jsonTemplateData = Template && Template.parentData(function (data) { return _.isObject(data) && data.document; });
  var data = jsonTemplateData && jsonTemplateData.document;
  return data || {};
}

EditableJSONInternal.getField = function () {
  var field = Blaze._parentData(1).fld;
  return (!(EditableJSON.disableIdField && field === '_id')) && field;  
}

EditableJSONInternal.getPath = function () {
  var path = Blaze._parentData(1).path;
  if (!_.isUndefined(path)) {
    return path;  
  }
  var path = Blaze._parentData(2).path;
  if (!_.isUndefined(path)) {
    return path;  
  }
  var path = Blaze._parentData(3).path;
  if (!_.isUndefined(path)) {
    return path;  
  }
}

EditableJSONInternal.makeEmptyType = function (item) {
  var tests = [
    [_.isDate(item), new Date()],
    [_.isArray(item), []],
    [_.isObject(item), {}],
    [_.isNull(item), null],
    [_.isBoolean(item), false],
    [_.isNumber(item), 0]
  ]
  var pass = _.find(tests, function (t) {
    return t[0]; 
  });
  if (pass) {
    return pass[1];  
  }
  return '';
}

EditableJSONInternal.changeValueType = function (item) {
  var tests = [
    [_.isArray(item), []],
    [_.isObject(item) && !(_.isArray(item) || _.isDate(item)), {}],
    [_.isNumber(item), 0],
    [_.isBoolean(item), false],
    [_.isDate(item), new Date()],
    [_.isNull(item), null],
    [_.isString(item), '']
  ]
  var index = 0;
  var oldType = _.find(tests, function (t) {
    if (t[0] && (_.isEqual(item, t[1]) || index === 3 || index === 4)) { //  && (_.isEqual(item, t[1]) || index === 0 || index === 4)
      return true;
    }
    index++;
  });
  if (oldType) {
    var ind = (index < (tests.length - 1)) ? (index + 1) : 0;
    return tests[ind][1];  
  }
  return undefined;
}

EditableJSONInternal.deep = function (obj, keys, value) {
        
  var root;
  var i = 0;
  var n = keys.length;

  // Set deep value
  if (arguments.length > 2) {

    root = obj;
    n--;

    while (i < n) {
      key = keys[i++];
      obj = obj[key] = _.isObject(obj[key]) ? obj[key] : {};
    }

    obj[keys[i]] = value;

    value = root;

  // Get deep value
  } else {
    while ((obj = obj[keys[i++]]) != null && i < n) {};
    value = i < n ? void 0 : obj;
  }

  return value;

}

/*var test = {
  a: [
    {b: {c: "d"}},
    {e: "f"}
  ],
  g: "h",
  i: {"j.k" : {l: "m"}}
}
EditableJSONInternal.deep(test, ['a','0','b', 'c'], 'w');
EditableJSONInternal.deep(test, ['a', '0', 'e'], 'x');
EditableJSONInternal.deep(test, ['g'], 'y');
EditableJSONInternal.deep(test, ['i','j.k','l'], 'z');
console.log(test);*/

EditableJSONInternal.update = function (tmpl, modifier, action, callback, callbackArguments) {
  var collectionName = tmpl.get('collection');
  if (!action) {
    var action = {};
    var mod = {};
    mod[modifier.field] = modifier.value;
    action[modifier.action] = mod;
  }
  // Only make a change if the new value doesn't match the existing one
  
  if (collectionName) {
    // Validate -- make sure the change isn't on the id field
    // And make sure we're not modifying the same field twice
    var okay = true;
    var conflict = false;
    var modFields = [];
    _.each(action, function (modifier, action) {
      if (_.has(modifier,'_id')) {
        okay = false;    
      }
      var field = _.keys(modifier)[0];
      if (!_.contains(modFields, field)) {
        // The following prevents all errors, but is too restrictive
        // && !_.find(modFields,function (f){ return field.indexOf(f) !== -1; })
        modFields.push(field);
      }
      else {
        conflict = true;  
      }
    });
    if (!okay) {
      if (EditableJSON.disableIdField) {
        console.log("You can't change the _id field.");
      }
      return;  
    }
    if (conflict) {
      console.log("You can't use conflicting modifiers.");
      return;    
    }
    var doc = EditableJSONInternal.getContext();
    
    // If it's a local collection, we don't bother with the call, we just update locally
    var collection = EditableJSON.collection(collectionName);
    if (collection && !collection._name) {
      var res = doUpdate(collectionName, doc._id, action);
      if (res) {
        var mutatedDoc = EditableJSON.collection(collectionName).findOne({_id: doc._id});
        EditableJSON._runCallbacks(EditableJSON._afterUpdateCallbacks, mutatedDoc, collectionName, action, doc, res);  
      }
      return;    
    }

    Meteor.call('editableJSON_update', collectionName, doc._id, action, function (err, res) {
      if (err) {
        console.log("You can't use conflicting modifiers."); // We're making a big assumption here in giving this message -- TODO -- actually check the message
        console.log(err);
      }
      else {
        if (_.isFunction(callback)) {
          callback.apply(null,callbackArguments);  
        }
        if (res) {
          var mutatedDoc = EditableJSON.collection(collectionName).findOne({_id: doc._id});
          EditableJSON._runCallbacks(EditableJSON._afterUpdateCallbacks, mutatedDoc, collectionName, action, doc, res);
        }
      }
    });
  }
  else {
    var JSONbefore = EditableJSONStore.get('editableJSON' + EditableJSONInternal.store(tmpl.get('store')));
    var JSONafter = EditableJSONStore.get('editableJSON' + EditableJSONInternal.store(tmpl.get('store')));
    var path = modifier.path;
    var unsetPath = modifier.unsetPath;
    _.each(action, function (modifier, action) {
      var fieldName = _.keys(modifier)[0];
      var value = modifier[fieldName];
      switch (action) {
        case '$set' :
          JSONafter = EditableJSONInternal.deep(JSONafter, path, value);
          break;
        case '$unset' :
          JSONafter = EditableJSONInternal.deep(JSONafter, unsetPath, undefined);
          break;
        case '$push' :
          var arr = EditableJSONInternal.deep(JSONafter, path);
          arr.push(value);
          JSONafter = EditableJSONInternal.deep(JSONafter, path, arr);
          break;
        case '$pull' :
          var arr = EditableJSONInternal.deep(JSONafter, path);
          arr = _.reduce(arr, function (memo, item) {
            if (!_.isEqual(value, item)) {
              memo.push(item);
            }
            return memo;
          },[]);
          JSONafter = EditableJSONInternal.deep(JSONafter, path, arr);
          break;
      }
      
    });
    EditableJSONStore.set('editableJSON' + EditableJSONInternal.store(tmpl.get('store')), JSONafter);
    if (_.isFunction(callback)) {
      callback.apply(null,callbackArguments);  
    }
    EditableJSON._runCallbacks(EditableJSON._afterUpdateCallbacks, JSONafter, tmpl.get('store'), action, JSONbefore, 1);
  }
}

EditableJSONInternal.handleDoubleClick = function (evt, tmpl) {
  evt.stopPropagation();
  evt.stopImmediatePropagation();
  var editingField = tmpl.get('editingField');
  if (editingField) {
    editingField.set(null);    
  }
  Tracker.flush();
  /*console.log("tmpl.data:",tmpl.data); // tmpl.data has the whole data context, including the field we want
  console.log("this:", this); // this.value has an object with fld (full path through object), field (deepest field) and val, which is the value for the field*/
  // Need to check on type of this.value.val and decide if we're adding to an array or an object
  var self = this;
  var type = (_.isArray(self.value.val)) ? 'array' : ((_.isObject(self.value.val) && !_.isDate(self.value.val)) ? 'object' : null);
  var target = tmpl.$(evt.target);
  if ((target.hasClass('editableJSON-empty-object') && !target.parent().hasClass('editable-JSON-top-level') ) || !type) {
    if (evt.type === 'click') {
      return;    
    }
    if (!localStorage.editableJSONdblclickMessage) {
      localStorage.editableJSONdblclickMessage = true;
      alert('Double click on "empty" values to change their type.\n\nClick to the right of objects and arrays to add fields.');
    }
    // Change field type
    var newValue = EditableJSONInternal.changeValueType(self.value.val);
    if (!_.isUndefined(newValue)) {
      // It passed the empty/null/zero/'' test, so we switch its type
      var modifier = {
        field: self.value.fld,
        value: newValue,
        action: "$set",
        path: self.value.path
      };
      EditableJSONInternal.update(tmpl, modifier);
    }
    return;
  }
  // Okay, we're not changing a value type with the double click, we're adding a field instead
  var sample = (type === 'array') ? self.value.val[0] : _.values(self.value.val)[0];
  var newValue = EditableJSONInternal.makeEmptyType(sample); 
  var fieldName = _.keys(self.value.val)[0] || 'newField';
  
  // We now add a new field
  var number = '';
  while (type === 'object' && !_.isUndefined(self.value.val[fieldName + number])) {
    number++;  
  }
  var newFieldName = fieldName + number;
  var path = self.value && self.value.path || [];
  if (type === 'object') {
    path = path.concat([newFieldName]);
  }
  var modifier = {
    field: self.value.fld + (self.value.fld && ((type === 'object') ? '.' : '') || '') + ((type === 'object') ? (newFieldName) : ''),
    value: newValue,
    action: (type === 'array') ? "$push" : "$set",
    path: path
  }

  EditableJSONInternal.update(tmpl, modifier, undefined, function (tmpl, evt, newFieldName) {
    // Check for unpublished fields
    Tracker.flush();
    var self = this;
    Meteor.defer(function () {
      var newFieldElem = tmpl.$(evt.target).find('.editable-JSON-field-text').filter(function () { return $(this).text() === newFieldName; });
      if (tmpl.data.collection && !newFieldElem.length) {
        EditableJSON._runCallbacks(EditableJSON._onUnpublishedFieldAddedCallbacks, this, tmpl.get('collection') || tmpl.get('store'), newFieldName, newValue);
      }
      else {
        // Make the new automatically field selected for editing
        newFieldElem.trigger('click');
      }
    });
  }, [tmpl, evt, newFieldName]);
}

EditableJSONInternal.store = function (storeName) {
  return (storeName) ? '.' + storeName : '';
}

EditableJSONInternal.tabToNextField = function (elem, original) {
  // Trigger a click on the next field
  if (!elem.length) {
    // Go a level higher and search again
    parentElem = original.parent().closest('.editable-JSON-click-zone');
    parentSiblingElem = parentElem.next();
    if (parentElem.length) {
      if (parentSiblingElem.length) {
        // Try to find next .editable-JSON-field
        elem = parentSiblingElem.find('.editable-JSON-field');
        if (!elem.length) {
          EditableJSONInternal.tabToNextField(elem, parentSiblingElem); 
        }
      }
      else {
        EditableJSONInternal.tabToNextField(parentSiblingElem, parentElem);
      }
    }
  }
  if (elem.length) {
    if (elem.eq(0).closest('.editable-JSON')) {
      elem.eq(0).trigger('click');
    }
  }     
}

EditableJSON.retrieve = function (storeName) {
  return EditableJSONStore.get('editableJSON' + EditableJSONInternal.store(storeName));
}

Template.editableJSON.onCreated(function () {
  var self = this;
  self.editingField = new ReactiveVar();
  if (self.data && self.data.collection) {
    self.autorun(function () {
      var Collection = EditableJSON.collection(self.data.collection);
      var doc = Collection && Collection.find().count() && self.data.document; // Collection.find().count() is the reactivity trigger
      self.collection = self.data.collection;
      self.document = doc || {};
    });
    return;
  }
  else if (self.data && self.data.store) {
    self.store = self.data.store;
  }
  var explicitData = (!_.isUndefined(self.data.observe)) ? self.data.observe : self.data.json;
  var initialValue = (!_.isUndefined(explicitData)) ? explicitData : (((self.store) ? self.parent().data : self.data) || {});
  EditableJSONStore.set('editableJSON' + EditableJSONInternal.store(self.store), initialValue);
  if (self.data.observe) {
    self.watcher = new Tracker.Dependency;
    this.autorun(function () {
      // watcher is watching for external changes
      self.watcher.depend();
      Meteor.defer(function () {
        var newJSON = (!_.isUndefined(self.data.observe)) ? self.data.observe : (((self.store) ? self.parent().data : self.data) || {});
        EditableJSONStore.set('editableJSON' + EditableJSONInternal.store(self.store), newJSON);
      });
    });
  }
});

Template.editableJSON.helpers({
  watcher: function () {
    Template.instance().watcher.changed(); 
  },
  json: function () {
    return this.json || Template.instance().data;  
  }
});

Template.editableJSON.events({
  'dblclick .editable-JSON-click-zone, click .editable-JSON-click-zone' : function (evt, tmpl) {
    // We need to fake a data context to allow addition of top level fields
    var context = {
      field: '',
      value: {
        val: this.document || this.json || this.observe || tmpl.data,
        field: '',
        fld: ''  
      }
    }
    EditableJSONInternal.handleDoubleClick.call(context, evt, tmpl); 
  }
});

Template.editable_JSON.helpers({
  fields: function () {
    var self = this;
    var index = -1;
    var arrayComma = self.arrayComma || false;
    if (_.has(self,'____val')) {
      index = self.arrIndex - 1;
      delete self.arrIndex;
      delete self.arrayComma;
    }
    var fields = _.map(self, function (value, field) {
      index++;
      var parent = null;
      var number = 2;
      while (Blaze._parentData(number) && Blaze._parentData(number)._id === undefined && Blaze._parentData(number).fld === undefined) {
        number++;  
      }
      parent = Blaze._parentData(number);
      var currentField = (field !== '____val') ? field : index;
      var fld = (parent && parent.fld) ? parent.fld + ((currentField !== undefined) ? '.' + currentField : '') : currentField;
      var parentPath = parent && parent.path || [];
      var path = (currentField !== undefined) ? parentPath.concat([currentField]) : parentPath;
      return {
        field:(field !== '____val') ? currentField : null,
        value:{val: value, fld: fld, path: path, field: currentField, arrayComma: arrayComma},
        index:index
      }; 
    });
    return fields;
  },
  value: function () {
    return (_.isObject(this.value) && _.has(this.value, '____val')) ? this.value.____val : this.value;  
  },
  isArray: function () {
    return _.isArray(this.val); 
  },
  isObject: function () {
    return _.isObject(this.val);
  },
  isString: function () {
    return _.isString(this.val);
  },
  isBoolean: function () {
    return _.isBoolean(this.val);  
  },
  isDate: function () {
    return _.isDate(this.val);  
  },
  isNumber: function () {
    return _.isNumber(this.val);  
  },
  isNull : function () {
    return _.isNull(this.val);  
  },
  last: function (obj) {
    return (obj.____val !== undefined) || _.size(obj) === (this.index + 1);
  },
  editingField : function () {
    var fieldName = this.toString()
    var fldData = Template.parentData(function (data) { return data && data.fld; });
    var fld = fldData && (fldData.fld + '.' + fieldName) || fieldName;
    var template = Blaze._templateInstance();
    var editingField = template.get('editingField');
    return editingField && (editingField.get() === fld) && fieldName;
  },
  _idClass: function () {
    return (String(this) === "_id") ? "editable-JSON-_id-field" : "";
  }
});

Template.editable_JSON.events({
  'click .editable-JSON-field' : function (evt, tmpl) {
    evt.stopPropagation();
    tmpl.$(evt.target).find('.editable-JSON-field-text').trigger('click');
  },
  'click .editable-JSON-field-text' : function (evt,tmpl) {
    evt.stopPropagation();
    var fieldName = this.toString();
    if (fieldName === '_id') {
      return;    
    }
    var elem = $(evt.target).closest('.editable-JSON-field');
    var fldData = Template.parentData(function (data) { return data && data.fld; });
    var field = fldData && (fldData.fld + '.' + fieldName) || fieldName;
    if (evt.type === 'click') { 
    var editingField = tmpl.get('editingField');
      if (editingField) {
        editingField.set(field);
        Tracker.flush();
        EditableJSONInternal.editing_key_press(elem,true);
      }
    }
  },
  'dblclick .editable-JSON-click-zone, click .editable-JSON-click-zone' : function (evt, tmpl) {
    EditableJSONInternal.handleDoubleClick.call(this, evt, tmpl); 
  },
  'keydown .editable-JSON-field input, focusout .editable-JSON-field input' : function (evt, tmpl) {
    evt.stopPropagation();
    var charCode = evt.which || evt.keyCode;
    if (evt.type === 'keydown') {
      if (charCode === 27) {
        var editingField = tmpl.get('editingField');
        editingField.set(null);
        return;  
      }
      if (charCode === 9) {
        evt.preventDefault();
        // As much as we'd just like to look in this template, we need to go further up the tree, so no tmpl.$ here
        var elem = $(evt.target).parent().nextAll("span, .editable-JSON-indent").first().find("span.editable-JSON-field-text, span.editable-JSON-edit");
        EditableJSONInternal.tabToNextField(elem, $(evt.target));
        return;  
      }
      if (charCode !== 13) {
        EditableJSONInternal.editing_key_press($(evt.target));
        return;  
      }
    }
    var editingField = tmpl.get('editingField');
    var currentFieldName = editingField.get();
    if (!currentFieldName) {
      return;    
    }
    var parentFieldName = _.initial(currentFieldName.split('.'));
    var editedFieldName = $(evt.currentTarget).val();
    var rejoinedParentFieldName = parentFieldName.join('.');
    var newFieldName = ((rejoinedParentFieldName) ? rejoinedParentFieldName + '.' : '') + editedFieldName;
    if (newFieldName !== currentFieldName) {
      var modifier1 = {};
      modifier1[currentFieldName] = 1;
      var action = {
        "$unset" : modifier1
      };
      if (editedFieldName) {
        var modifier2 = {};
        modifier2[newFieldName] = tmpl.data[String(this)];  
        action["$set"] = modifier2;
      }
      EditableJSONInternal.update(tmpl, {path: (EditableJSONInternal.getPath() || []).concat([editedFieldName]), unsetPath: (EditableJSONInternal.getPath() || []).concat([String(this)])}, action, function () {
        editingField.set(null); 
      });
    }
    else {
      editingField.set(null);
    }
  }
});

Template.editable_JSON_object.helpers({
  notEmpty: function () {
    return !_.isEmpty(this);  
  }
});

Template.editable_JSON_array.helpers({
  elements: function () {
    var self = this;
    var lastIndex = self.length - 1;
    var elements = _.map(this, function (value, index) {
      var arrayComma = (index !== lastIndex) ? true : false;
      return {element:{____val: value, arrIndex: index, arrayComma: arrayComma}, index: index};
    });
    return elements;
  },
  last: function (arr) {
    return arr.length === (this.index + 1);
  }
});

Template.editable_JSON_string.helpers({
  _idField: function () {
    var parentData = Template.parentData(1);
    return parentData && parentData.fld && parentData.fld === '_id';
  }
});

Template.editable_JSON_string.events({
  'click .editable-JSON-string' : function (evt, tmpl) {
    evt.stopPropagation();
    tmpl.$(evt.target).find('.editable-JSON-edit').trigger('click');
  }
});

Template.editable_JSON_number.events({
  'click .editable-JSON-number' : function (evt, tmpl) {
    evt.stopPropagation();
    tmpl.$(evt.target).find('.editable-JSON-edit').trigger('click');
  }
});

Template.editable_JSON_date.helpers({
  date: function () {
    return this.toISOString();
  }
});

Template.editable_JSON_date.events({
  'change input' : function (evt, tmpl) {
     var currentDate = new Date(this);
     var newDate = new Date(tmpl.$('input').val());
     if (currentDate.getTime() !== newDate.getTime()) {
       var field = EditableJSONInternal.getField();
       var modifier = {
         field: field,
         value: newDate,
         action: "$set",
         path: EditableJSONInternal.getPath()
       }
       EditableJSONInternal.update(tmpl, modifier);
    }
  }
});

Template.editable_JSON_boolean.helpers({
  boolean: function () {
    return (this.valueOf() == true) ? 'true' : 'false';
  }
});

Template.editable_JSON_boolean.events({
  'click .editable-JSON-boolean' : function (evt,tmpl) {
    evt.stopPropagation();
    var field = EditableJSONInternal.getField();
    var modifier = {
      field: field,
      value: !this.valueOf(),
      action: "$set",
      path: EditableJSONInternal.getPath()
    };
    EditableJSONInternal.update(tmpl,modifier);  
  }
});

Blaze.registerHelper('editable_JSON_getField', function () {
  return EditableJSONInternal.getField();
});

Blaze.registerHelper('editable_JSON_getContext', function () {
  return EditableJSONInternal.getContext();
});

Blaze.registerHelper('editable_JSON_collection', function () {
  var template = Blaze._templateInstance();
  var collection = template.get('collection');
  return collection;
});

Template.editableJSONInput.created = function () {
  this.editing = new ReactiveVar(false);
}

Template.editableJSONInput.helpers({
  editing: function () {
    return Blaze._templateInstance().editing.get();
  }
});

Template.editableJSONInput.events({
  'click .editable-JSON-edit' : function (evt, tmpl) {
    evt.stopPropagation();
    if (EditableJSON.disableIdField && String(this) === '_id') {
      return;
    }
    var parent = $(evt.target).parent();
    tmpl.editing.set(true);
    Tracker.flush();
    EditableJSONInternal.editing_key_press(parent, true);
  },
  'keydown input' : function (evt, tmpl) {
    var charCode = evt.which || evt.keyCode;
    if (charCode === 27) {
      tmpl.editing.set(false);  
    }
    if (charCode === 9) {
      evt.preventDefault();
      // Trigger a click on the next field
      // As much as we'd just like to look only in this template, we need to go further up the tree, so no tmpl.$ here
      var elem = $(evt.target).closest('.editable-JSON-click-zone').next(".editable-JSON-click-zone").find("span.editable-JSON-field-text, span.editable-JSON-edit");
      EditableJSONInternal.tabToNextField(elem, $(evt.target));
    }
    if (charCode === 8 || charCode === 46) {
      // If this is an array and the field is empty, remove the field from the array
      var tellTaleNode = (!_.isUndefined(Template.parentData(5)["____val"]) && Template.parentData(5)) || (!_.isUndefined(Template.parentData(4)["____val"]) && Template.parentData(4));
      var currentVal = tmpl.$(evt.target).val();
      if (tellTaleNode && currentVal === '') {
        var arrayNode = Template.parentData(function (d) { return _.isArray(d.val) && d.fld; });
        var modifier = {
          field: arrayNode.fld,
          value: this.value,
          action: "$pull",
          path: arrayNode.path
        };
        EditableJSONInternal.update(tmpl, modifier, null, function () {
          // We need an editing key press because the element will have changed
          Meteor.defer(function () {
            EditableJSONInternal.editing_key_press($(document.activeElement));
          });
        });
        // Disable the delete key for a couple of seconds
        // So that user won't be sent back a page after deleting an array field
        // if they keep pressing delete
        var disableKeypress = function(e) {
          var charCode = e.which || evt.keyCode;
          if (charCode === 8 || charCode === 45) {
            e.preventDefault();
          }
        }
        $(document).on('keypress', disableKeypress);
        Meteor.setTimeout(function () {
          $(document).off('keypress', disableKeypress);
        }, 2000);
      }
    }
    if (charCode !== 13) {
      EditableJSONInternal.editing_key_press(tmpl.$(evt.target));
    }
  },
  'keyup input, focusout input' : function (evt, tmpl) {
    if (evt.type === 'keyup') {
      var charCode = evt.which || evt.keyCode;
      if (charCode !== 13) {
        return;  
      }
    } 
    var elem = tmpl.$(evt.target);
    var value = elem.val();
    if (this.number) {
      if (!/^(\-|\+)?([0-9]+(\.[0-9]+)?|Infinity)$/.test(value)) {
        // If it's not a number, just revert the value and return
        elem.val(tmpl.data.value || 0);
        return;  
      }
      else {
        value = parseFloat(value);
        if (_.isNaN(value)) {
          value = 0;    
        } 
      }
    }
    if (value !== this.value) {
      var modifier = {
        field: this.field,
        value: value,
        action: "$set",
        path: EditableJSONInternal.getPath()
      };
      EditableJSONInternal.update(tmpl, modifier, null, function () {
        tmpl.editing.set(false);
      });
    }
    else {
      tmpl.editing.set(false);    
    }
  }
});