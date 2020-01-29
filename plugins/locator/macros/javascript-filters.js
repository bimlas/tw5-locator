/*\
title: $:/plugins/bimlas/locator/macros/javascript-filters.js
type: application/javascript
module-type: filteroperator

Special filters used by Locator

\*/
(function() {

	/*jslint node: true, browser: true */
	/*global $tw: true */
	"use strict";

	function getFieldListingOperator(options,field) {
		var fieldOptionsTiddler = "$:/config/bimlas/locator/fields/" + field;

		return options.wiki.getCacheForTiddler(fieldOptionsTiddler,"fieldListingOperator",function() {
			var fieldOptions = options.wiki.getTiddler(fieldOptionsTiddler);

			return fieldOptions && fieldOptions.fields["field-type"] === "list"
				? "contains"
				: "field";
		});
	}

	function getFieldDirection(options,field) {
		var fieldOptions = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + field);

		return (fieldOptions || {fields: {}}).fields["field-direction"];
	}

	function getActiveFilters(options,filterState) {
		return options.wiki.getCacheForTiddler(filterState,"activeFilters",function() {
			var filteredFields = options.wiki.getTiddlerDataCached(filterState,{});
			var results = {};

			$tw.utils.each(filteredFields,function(valuesAsString,field) {
				var values = $tw.utils.parseStringArray(valuesAsString) || [];
				if(values.length) {
					results[field] = values;
				}
			});

			return results;
		});
	}

	function applyFieldsFilters(source,options,filterState,filterFunc,prefix) {
		var filterOperators = options.wiki.getFilterOperators();
		var activeFilters = getActiveFilters(options,filterState);
		var results = source;

		if(!Object.keys(activeFilters).length) return results;

		$tw.utils.each(activeFilters,function(values,field) {
			$tw.utils.each(values,function(value) {
				if(value === "ANY-VALUE") {
					results = filterOperators["has"](results,{operand: field,prefix: prefix},options);
				} else {
					results = filterFunc(filterOperators,results,field,value,prefix);
				}
				results = options.wiki.makeTiddlerIterator(results);
			});
		});

		return results;
	}

	function getDirectionOfTraverse(options,contextState,fieldOfRelationship) {
		var contextStateTiddler = options.wiki.getTiddler(contextState) || {fields: []};
		var fieldSettings = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + fieldOfRelationship) || {fields: []};
		var direction = fieldSettings.fields["field-direction"];
		if(contextStateTiddler.fields["invert-direction"] === "yes") {
			direction = ["from","to"][(direction === "from") + 0];
		}
		return direction;
	}

	function enlistChildren(options,parentTitle,fieldOfRelationship,directionOfTraverse) {
		return options.wiki.getGlobalCache("bimlas-locator-enlist-children-" + parentTitle + "-" + fieldOfRelationship + "-" + directionOfTraverse, function() {
			return fieldOfRelationship === "LINKS-IN-TEXT"
				? byLinksInText(parentTitle)
				: byField(parentTitle);
		});

		function byLinksInText(title) {
			return directionOfTraverse === "to"
				? options.wiki.getTiddlerBacklinks(title)
				: options.wiki.getTiddlerLinks(title);
		}

		function byField(title) {
			return directionOfTraverse === "to"
				? options.wiki.findListingsOfTiddler(title,fieldOfRelationship)
				: options.wiki.getTiddlerList(title,fieldOfRelationship);
		}
	}

	/*
	Filter titles matching to Locator fields filter

	Input: list of tiddlers
	Param: filterState
	Prefix: "!" to exclude matching tiddlers
	Suffix: "recusive" enables recursive filtering
	*/
	exports["locator-fields-filter"] = function(source,operator,options) {
		var results = source;
		var activeRecursiveFilters = getActiveFilters(options,"$:/state/bimlas/locator/search/recursive-filters/");

		if(operator.suffix === "recursive") {
			results = applyFieldsFilters(results,options,operator.operand,recursiveFilterFunc,operator.prefix);
		} else {
			results = applyFieldsFilters(results,options,operator.operand,directFilterFunc,operator.prefix);
		}

		return results;

		function directFilterFunc(filterOperators,input,field,value,prefix) {
			var fieldListingOperator = getFieldListingOperator(options,field);
			return filterOperators[fieldListingOperator](input,{operand: value,prefix: prefix,suffix: field},options);
		}

		function recursiveFilterFunc(filterOperators,input,field,fieldValue,prefix) {
			var isRecursiveFilteringActive = $tw.utils.hop(activeRecursiveFilters,field) && (activeRecursiveFilters[field].indexOf(fieldValue) >= 0);
			if(isRecursiveFilteringActive) {
				var fieldDirection = getFieldDirection(options,field);
				var children = [];
				collectChildrenRecursively(fieldValue);
				var compareFunc = (prefix !== "!")
					? function(index) { return index >= 0 }
					: function(index) { return index < 0 };
				var results = [];

				input(function(tiddler,title) {
					if(compareFunc(children.indexOf(title))) {
						results = $tw.utils.pushTop(results, title);
					}
				});

				return results;

				function collectChildrenRecursively(parent) {
					$tw.utils.each(enlistChildren(options,parent,field,fieldDirection),function(child) {
						if(children.indexOf(child) < 0) {
							$tw.utils.pushTop(children, child);
							$tw.utils.pushTop(children, collectChildrenRecursively(child));
						}
					});
				}
			} else {
				return directFilterFunc(filterOperators,input,field,fieldValue,prefix);
			}
		}
	};

	/*
	Filter fields that are not disabled in Locator field options

	Input: list of fields
	Param (optional): if called from toggleable fields filter (`locator-view` and `locator-search`), set to "nested"
	*/
	exports["locator-enabled-fields"] = function(source,operator,options) {
		var typeOfFieldsFilter = operator.operand || "regular";
		var excludedFields = options.wiki.filterTiddlers("[all[tiddlers+shadows]field:hide-in-" + typeOfFieldsFilter + "-fields-filter[yes]removeprefix[$:/config/bimlas/locator/fields/]]") || [];
		var results = [];

		source(function(tiddler,title) {
			if(excludedFields.indexOf(title) < 0) {
				results.push(title);
			}
		});

		return results;
	};

	/*
	List fields which can be used to build tree ("tags" for example)

	Input: none
	Param (optional): field to check if it's a relationship field
	*/
	exports["locator-enlist-relationship-fields"] = function(source,operator,options) {
		var relationshipFields = options.wiki.getGlobalCache("bimlas-locator-enlist-relationship-fields",function() {
			return options.wiki.filterTiddlers("[all[tiddlers+shadows]prefix[$:/config/bimlas/locator/fields/]has[field-direction]removeprefix[$:/config/bimlas/locator/fields/]]");
		});

		if(operator.operand) {
			return relationshipFields.indexOf(operator.operand) >= 0
				? [operator.operand]
				: [];
		}

		return relationshipFields;
	};

	/*
	List field values according to Locator field settings

	Input: list of tiddlers
	Param: field
	*/
	exports["locator-enlist-field-values"] = function(source,operator,options) {
		var fieldListingOperator = getFieldListingOperator(options,operator.operand);
		var results = [];

		source(function(tiddler,title) {
			if(!tiddler) return;

			var value = tiddler.fields[operator.operand];
			if(fieldListingOperator === "contains") {
				value = $tw.utils.parseStringArray(value);
			}

			if(!value) return;

			results = $tw.utils.pushTop(results,value);
		});

		return results;
	};

	/*
	List of active field filters

	Input: filterState
	Param (optional): field
	*/
	exports["locator-selected-field-values"] = function(source,operator,options) {
		var activeFilters = {};

		source(function(tiddler,title) {
			$tw.utils.each(getActiveFilters(options,title),function(value,key) {
				activeFilters[key] = $tw.utils.pushTop(activeFilters[key] || [],value);
			});
		});

		if(!Object.keys(activeFilters).length) return [];

		return operator.operand
			? activeFilters[operator.operand] || []
			: ["TODO: Join active filter values (array of arrays)"];
	};

	/*
	List of active field names

	Input: filterState
	Param (optional): none
	*/
	exports["locator-selected-field-names"] = function(source,operator,options) {
		var fieldNames = [];

		source(function(tiddler,title) {
			fieldNames = $tw.utils.pushTop(fieldNames,Object.keys(getActiveFilters(options,title)));
		});

		return fieldNames;
	};

	/*
	List children of input elements based on selected relationship field

	Input: parent tiddlers
	Param: contextState
	Suffix: field of relationship
	*/
	exports["locator-enlist-children"] = function(source,operator,options) {
		var fieldOfRelationship = operator.suffix;
		var directionOfTraverse = getDirectionOfTraverse(options,operator.operand,fieldOfRelationship);
		var results = [];

		source(function(tiddler,title) {
			results = $tw.utils.pushTop(results, enlistChildren(options,title,fieldOfRelationship,directionOfTraverse));
		});

		return results;
	};

	/*
	Get direction of traverse: field direction + optional invert direction

	Input: contextState
	Param: field of relationship
	*/
	exports["locator-direction-of-traverse"] = function(source,operator,options) {
		var results = [];

		source(function(tiddler,title) {
			results = [getDirectionOfTraverse(options,title,operator.operand)];
		});

		return results;
	};

})();
