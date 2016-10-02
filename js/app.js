/*
    This is the single javascript file for the entire application
    The angular module depends on the anuglar-route and the higlight.js' angular wrapper

    The code is in the following parts :
    .config -> Used to configure the routing and the hljs

    .controller
        mainController : this calls all the required ajax calls as soon as the application loads
        codehubViewController : this would display the available data, and would update as soon as data is received
            Once all the data is received, MainController will broadcast a msg which would enable the other controller
            to update its value.

        Controllers for other page were not required
    .filters
        statusFilter : this is used to filter the array based on the status selected
        searchFilter : this would filter based on the query parameter provided
        pagination   : this would filter the range of results as computed by the parameters of pageSize and current page.
                        this would also trigger $routeScope.$emit event to update the max array size before filtering, which
                        would help in computing the max pages available after appling the filters and search

        rangeFil      : This is used for generating stars for rating. this would return array of certain length depending on the input
    .services
        dataManager    : This has three methods
            getDataForPage : gets data for a particular page
            getImageMapping : get the compiler image mapping json
            getStats : this would call the method `getDataForPage` for all the page and once all the promises are resolved,
                        this would compute the statistics and will provide the data
    .factory
        db : for sharing the data
        StatusCodeFac : using as string based enumeration
        utility : helper method used by the getStats method of the service to compute the statistics


*/
angular.module("codehub",["ngRoute","hljs"])
.config(["$routeProvider","hljsServiceProvider",function($routeProvider,hljsServiceProvider){
	//highlight js configurations
	hljsServiceProvider.setOptions({
		// replace tab with 2 spaces
		tabReplace: '  '
	});
	//Routing configurations
	$routeProvider.when('/',{
		templateUrl:"./partials/home.html",
	})
	.when("/submission",{
		templateUrl:"./partials/code.html",
		controller:"codehubViewController"
	})
	.when("/error",{
		templateUrl:"./partials/error.html",
	})
	.otherwise({
		redirectTo:"/error"
	})
}])
.controller("mainController",["$scope","dataManager",function($scope,dataManager){
	$scope.ifLoaded = true;
    $scope.goToCode = function(){
        $location.path('/code');
    }
    dataManager.getStats().then(function(response){
        $scope.$broadcast("DATA_UPDATED",{});
    },function(error){
        console.error(error);
    });

    dataManager.getImageMapping().then(function(response){
        $scope.$broadcast("DATA_UPDATED",{});
    },function(error){
        console.error(error);
    })  
}])
.controller("codehubViewController",["$scope","$rootScope","db","dataManager","StatusCodeFac",function($scope,$rootScope,db,dataManager,StatusCodeFac){
    $scope.stausTitles = StatusCodeFac;
    $scope.searchQuery = "";
    $scope.selectedStatus = {
        Accepted:false,
        Skipped:false,
        Memory:false,
        Time:false,
        Runtime:false,
        Compilation:false,
        Wrong:false
    };
    $scope.statusClass = {};
    $scope.statusClass[$scope.stausTitles.Accepted]="w3-green";
    $scope.statusClass[$scope.stausTitles.Skipped]="w3-grey";
    $scope.statusClass[$scope.stausTitles.Memory]="w3-orange";
    $scope.statusClass[$scope.stausTitles.Time]="w3-orange";
    $scope.statusClass[$scope.stausTitles.Runtime]="w3-orange";
    $scope.statusClass[$scope.stausTitles.Compilation]="w3-orange";
    $scope.statusClass[$scope.stausTitles.Wrong]="w3-red";
    $scope.pgSize = 50;
    $scope.currentPage = 1;

    $scope.imageData = {};
    function initializeVariables(){
        $scope.allRecords = db.submissions;
        $scope.imageData = db.imageMapping;
        $scope.topLanguages = db.stats["top-5-languages-used"];
        $scope.topSubmission = db.stats["top-2-submissions-attempted"];
        $scope.totalSubmission = db.stats["total-submission"];
        $scope.submissionPerLevel=db.stats["submissions-per-level"]; 
    }
    initializeVariables();
    $scope.$on("DATA_UPDATED",function(){
        initializeVariables();
    });
    var cleanUpFunc = $rootScope.$on("SEARCH_PAGE",function(event,data){
        $scope.maxPage = Math.ceil(data.arrSize/$scope.pgSize)
    });
    $scope.$on('$destroy', function() {
        cleanUpFunc();
    });
}])
//Filters
.filter("statusFilter",function(StatusCodeFac){
    return function(arr,StatusObj){
        var codeArr = [];
        for(key in StatusObj){
            if(StatusObj[key]){
                codeArr.push(StatusCodeFac[key]);
            }
        }
        if(codeArr.length == 0){
            return arr;
        }
        return arr.filter(function(u){
            return codeArr.indexOf(u.statusCode)>=0;
        })
    }
})
.filter("searchFilter",function(){
    return function(arr,queryStr){
        queryStr = queryStr.toLowerCase().trim();
        if(queryStr == ""){
            return arr;
        }
        return arr.filter(function(u){
            return u.title.toLowerCase().indexOf(queryStr)>=0 
            || u.language.toLowerCase().indexOf(queryStr)>=0
            || u.metadata.level.toLowerCase().indexOf(queryStr)>=0;
        })
    }
})
.filter("pagination",function($rootScope){
    return function(arr,pageSize,startPage){
        $rootScope.$emit("SEARCH_PAGE",{arrSize:arr.length});
        var startIndex = (startPage-1)*pageSize;
        var endIndex = startIndex+pageSize;
        return arr.slice(startIndex,endIndex);
    }
})
.filter("rangeFil",function(){
    return function(num){
        var arr = [];
        for(i=0;i<num;i++){
            arr.push(i);
        }
        return arr;
    }
})
//Services
.service("dataManager",function($http,$q,StatusCodeFac,db,utility){
    this.getDataForPage = function(pageNo){        
        return $q(function(resolve,reject){
            var key = "pg_" + pageNo;
            var rData = localStorage.getItem(key);
            if(rData==null){
                $http({
                    method:'GET',
                    url:'http://hackerearth.0x10.info/api/ctz_coders?type=json&query=list_submissions&page='+pageNo
                })
                .then(function(response){
                    rData = response.data.websites;
                    Array.prototype.push.apply(db.submissions,rData);
                    try{
                        localStorage.setItem(key,JSON.stringify(rData));
                    }catch(e){
                        console.error("unable to save to localstorage",e);
                    }
                    
                    resolve(rData);
                    
                },function(error){
                    reject(error);
                })
            }
            else{
                rData = JSON.parse(rData);
                Array.prototype.push.apply(db.submissions,rData);                
                resolve(rData);
            }
        })
    };    
    this.getImageMapping = function(){
        return $q(function(resolve,reject){
            var key = "imageKey";
            var rData = localStorage.getItem(key);
            if(rData==null){
                $http({
                    method:'GET',
                    url:'http://hackerearth.0x10.info/api/ctz_coders?type=json&query=list_compiler_image'
                })
                .then(function(response){
                    rData = response.data;
                    var imageData = rData.reduce(function(processedObj,obj){
                        processedObj[obj.language] = obj.icon;
                        return processedObj;
                    },{})
                    try{
                        localStorage.setItem(key,JSON.stringify(imageData));
                    }catch(e){
                        console.error("unable to save to localstorage",e)
                    }
                    
                    db.imageMapping = imageData;
                    resolve(imageData);
                    
                },function(error){
                    reject(error);
                })
            }
            else{
                db.imageMapping = JSON.parse(rData);
                resolve(db.imageMapping);
            }
        })
    }
    this.getStats = function(){
        var key = "dbKEY";
        var rData = localStorage.getItem(key);

        var self = this;
        return $q(function(resolve,reject){
            if(rData == null){
                var promiseArr = [];
                var maxPageCount = 70;//1347;
                for(var i=1;i<=maxPageCount;i++){
                    promiseArr.push(self.getDataForPage(i));
                }
                $q.all(promiseArr).then(function(response){
                    var allSubmissions =  response.reduce(function(processedArr,unit){
                        Array.prototype.push.apply(processedArr,unit);
                        return processedArr;
                    },[]);
                    var langStat = {};
                    var subStat = {};
                    var levelStat = {};
                    allSubmissions.forEach(function(u){
                        u.statusCode = utility.getStatusCode(u.compiler_status);
                        utility.incrementOrInit(langStat,u.language);
                        utility.incrementOrInit(subStat,u.title);
                        utility.incrementOrInit(levelStat,u.metadata.level);
                    })
                    // get the top 5 language by processing the langstat
                    db.submissions.length = 0;
                    Array.prototype.push.apply(db.submissions,allSubmissions);
                    db.stats["top-5-languages-used"] = utility.calculateTop(langStat,5);
                    db.stats["top-2-submissions-attempted"] = utility.calculateTop(subStat,2);
                    db.stats["submissions-per-level"] = levelStat;
                    db.stats["total-submission"] = allSubmissions.length;     
                    try{
                        localStorage.setItem(key,JSON.stringify(db));
                    }catch(e){
                        console.error("unable to save data to localstorge",e)
                    }
                    
                    resolve({status:"OKAY"});
                },function(error){
                    reject(error);
                });
            }else{
                var parsedData = JSON.parse(rData);
                db.submissions = parsedData.submissions;
                db.stats["top-5-languages-used"] = parsedData.stats["top-5-languages-used"];
                db.stats["top-2-submissions-attempted"] = parsedData.stats["top-2-submissions-attempted"];
                db.stats["total-submission"]= parsedData.stats["total-submission"];
                db.stats["submissions-per-level"] = parsedData.stats["submissions-per-level"];
                resolve({status:"OKAY"});
            }

        });            
    }
})
//Data Sharing Factory
.factory("db",function(){
    return {
        imageMapping:{},
        submissions:[],
        stats:{
            "top-5-languages-used":[],
            "top-2-submissions-attempted":[],
            "submissions-per-level":{
                "Hard":0,
                "Medium":0,
                "Easy":0
            },
            "total-submission":0
        }
    }
})
//Utility factory

.factory("StatusCodeFac",function(){
    return {
        Accepted:"Accepted",
        Skipped:"Skipped",
        Memory:"Memory Limit Exceeded",
        Time:"Time Limit Exceeded",
        Runtime:"Runtime error",
        Compilation:"Compilation error",
        Wrong:"Wrong Answer"
    }
})
.factory("utility",["StatusCodeFac",function(StatusCodeFac){
    function incrementOrInit(obj,key){
        if(!obj[key]){
            obj[key] = 1;
        }else{
            obj[key]++;
        }
    };
    function calculateTop(obj,topNo){
        var arr = [];
        for(var key in obj){
            arr.push({name:key,count:obj[key]});
        }
        arr.sort(function(a,b){
            return b.count-a.count;
        });
        arr.length = topNo;
        return arr;
    }
    function getStatusCode(statusStr){
        if(statusStr=="Accepted"){
            return StatusCodeFac.Accepted;
        }
        else if(statusStr.indexOf("Wrong")>=0){
            return StatusCodeFac.Wrong;
        }
        else if(statusStr.indexOf("Memory limit")>=0){
            return StatusCodeFac.Memory;
        }
        else if(statusStr.indexOf("Time limit")>=0){
            return StatusCodeFac.Time;
        }
        else if(statusStr=="Skipped"){
            return StatusCodeFac.Skipped;
        }
        else if(statusStr.indexOf("Compilation error")>=0){
            return StatusCodeFac.Compilation;
        }
        else if(statusStr.indexOf("Runtime error")>=0){
            return StatusCodeFac.Runtime;
        }
    }
	return {
		incrementOrInit:incrementOrInit,
        calculateTop:calculateTop,
        getStatusCode:getStatusCode
	}
}])
