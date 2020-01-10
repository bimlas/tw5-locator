/*\
title: $:/plugins/bimlas/locator/macros/javascript-filters.js
type: application/javascript
module-type: filteroperator

Special filters used by Locator

\*/
(function () {

    /*jslint node: true, browser: true */
    /*global $tw: true */
    "use strict";

    function getFieldListingOperator(options, field) {
        var fieldOptionsTiddler = "$:/config/bimlas/locator/fields/" + field;

        return options.wiki.getCacheForTiddler(fieldOptionsTiddler, "fieldListingOperator", function() {
            var fieldOptions = options.wiki.getTiddler(fieldOptionsTiddler);

            return fieldOptions && fieldOptions.fields["field-type"] === "list"
                ? "contains"
                : "field";
        });
    }

    function getFieldDirection(options, field) {
        var fieldOptions = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + field);

        return (fieldOptions || {fields: {}}).fields["field-direction"];
    }

    function getActiveFilters(options, filterState) {
        return options.wiki.getCacheForTiddler(filterState, "activeFilters", function() {
            var filteredFields = options.wiki.getTiddlerDataCached(filterState, {});
            var results = {};

            $tw.utils.each(filteredFields, function(valuesAsString, field) {
                var values = $tw.utils.parseStringArray(valuesAsString) || [];
                if(values.length) {
                    results[field] = values;
                }
            });

            return results;
        });
    }

    function applyFieldsFilters(source, options, filterState, filterFunc, prefix) {
        var activeFilters = getActiveFilters(options, filterState);
        var results = source;

        if (!Object.keys(activeFilters).length) return results;

        $tw.utils.each(activeFilters, function (values, field) {
            $tw.utils.each(values, function (value) {
                results = filterFunc(results, field, value, prefix);
                results = options.wiki.makeTiddlerIterator(results);
            });
        });

        return results;
    }

    /*
    Filter titles matching to Locator fields filter

    Input: list of tiddlers
    Param: filterState
    Prefix: "!" to exclude matching tiddlers
    Suffix: "recusive" enables recursive filtering
    */
    exports["locator-fields-filter"] = function (source, operator, options) {
        var results = source;
        var filterOperators = options.wiki.getGlobalCache("bimlas-locator-filterOperators", function() {
            return options.wiki.getFilterOperators();
        });
        var activeRecursiveFilters = getActiveFilters(options, "$:/state/bimlas/locator/search/recursive-filters/");

        if (operator.suffix === "recursive") {
            results = applyFieldsFilters(results, options, operator.operand, recursiveFilterFunc, operator.prefix);
        } else {
            results = applyFieldsFilters(results, options, operator.operand, directFilterFunc, operator.prefix);
        }

        return results;

        function directFilterFunc(input, field, value, prefix) {
            var fieldListingOperator = getFieldListingOperator(options, field);
            return filterOperators[fieldListingOperator](input, { operand: value, prefix: prefix, suffix: field }, options);
        }

        function recursiveFilterFunc(input, field, value, prefix) {
            var isRecursiveFilteringActive = $tw.utils.hop(activeRecursiveFilters, field) && (activeRecursiveFilters[field].indexOf(value) >= 0);
            if (isRecursiveFilteringActive) {
                var fieldDirection = getFieldDirection(options, field);
                return filterOperators.kin(input, { operand: value, prefix: prefix, suffixes: [[field], [fieldDirection]] }, options);
            } else {
                return directFilterFunc(input, field, value, prefix)
            }
        }
    };

    /*
    Filter fields that are not disabled in Locator field options

    Input: list of fields
    Param: none
    */
    exports["locator-enabled-fields"] = function (source, operator, options) {
        var excludedFields = options.wiki.filterTiddlers("[all[tiddlers+shadows]field:exclude-from-field-filters[yes]removeprefix[$:/config/bimlas/locator/fields/]]");
        var results = [];

        source(function (tiddler, title) {
            if (excludedFields.indexOf(title) < 0) {
                results.push(title)
            }
        });

        return results;
    };

    /*
    List fields which can be used to build tree ("tags" for example)

    Input: none
    Param (optional): field to check if it's a relationship field
    */
    exports["locator-enlist-relationship-fields"] = function (source, operator, options) {
        var relationshipFields = options.wiki.getGlobalCache("bimlas-locator-enlist-relationship-fields", function() {
            return options.wiki.filterTiddlers("[all[tiddlers+shadows]prefix[$:/config/bimlas/locator/fields/]has[field-direction]removeprefix[$:/config/bimlas/locator/fields/]]");
        });

        if (operator.operand) {
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
    exports["locator-enlist-field-values"] = function (source, operator, options) {
        var fieldListingOperator = getFieldListingOperator(options, operator.operand);
        var results = [];

        source(function (tiddler, title) {
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

    Input: filterState - TODO: Cannot use variable as filter suffix?
    Param (optional): field
    */
    exports["locator-selected-field-values"] = function (source, operator, options) {
        var activeFilters = {};

        source(function (tiddler, title) {
            $tw.utils.each(getActiveFilters(options, title), function(value, key) {
                activeFilters[key] = $tw.utils.pushTop(activeFilters[key] || [], value);
            });
        });

        if (!Object.keys(activeFilters).length) return [];

        return operator.operand
            ? activeFilters[operator.operand] || []
            : ["TODO: Join active filter values (array of arrays)"];
    };

    /*
    List of active field names

    Input: filterState - TODO: Cannot use variable as filter suffix?
    Param (optional): none
    */
    exports["locator-selected-field-names"] = function (source, operator, options) {
        var fieldNames = [];

        source(function (tiddler, title) {
            fieldNames = $tw.utils.pushTop(fieldNames, Object.keys(getActiveFilters(options, title)));
        });

        return fieldNames;
    };

    /*
    List children of input elements based on selected relationship field

    Input: parent tiddlers
    Param: contextState
    */
    exports["locator-enlist-children"] = function (source, operator, options) {
        var contextState = options.wiki.getTiddler(operator.operand) || {fields: []};
        var fieldOfRelationship = contextState.fields["field-of-relationship"] || "tags";
        var fieldSettings = options.wiki.getTiddler("$:/config/bimlas/locator/fields/" + fieldOfRelationship) || {fields: []};
        var shouldFindListings = (fieldSettings.fields["field-direction"] || "to") === "to";
        if(contextState.fields["invert-direction"] === "yes") {
            shouldFindListings = !shouldFindListings;
        }
        var results = [];

        source(function (tiddler, title) {
            results = $tw.utils.pushTop(results, shouldFindListings
                ? options.wiki.findListingsOfTiddler(title, fieldOfRelationship)
                : options.wiki.getTiddlerList(title, fieldOfRelationship)
            );
        });

        return results;
    };

})();
