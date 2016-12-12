const app = angular.module('jav-idol-face', ['angular-loading-bar', 'angularUtils.directives.dirPagination', 'firebase', 'toastr']);

app.directive("fileread", [() => ({
        scope: {
            fileread: "="
        },

        link(scope, element, attributes) {
            element.bind("change", changeEvent => {
                const reader = new FileReader();
                reader.onload = loadEvent => {
                    scope.$apply(() => {
                        scope.fileread = loadEvent.target.result;
                    });
                }
                reader.readAsDataURL(changeEvent.target.files[0]);
            });
        }
    })]);

app.config([
    'toastrConfig', toastrConfig => {
        angular.extend(toastrConfig, {timeOut: 5000});
    }
]);

app.filter('dateFromNow', function() {
    return function(date) {
        if (!moment) {
            console.log('Error: momentJS is not loaded as a global');
            return '!momentJS';
        }
        return moment(date).fromNow();
    }
});

app.config([
    'paginationTemplateProvider',
    function(paginationTemplateProvider) {
        paginationTemplateProvider.setPath('/js/templates/dirPagination.tpl.html');
    }
]);

app.factory('idolService', [
    '$http',
    function($http) {

        function nameToLink(name) {
            // Generate thumbnail link based on name
            var lowerCaseName = name.trim().split(' ').map(n => n.toLowerCase()).join('-');
            return `http://www.japanesebeauties.net/japanese/${lowerCaseName}/1/cute-${lowerCaseName}-1.jpg`;
        }

        return {
            loadIdols() {
                return $http({method: 'GET', url: 'https://s3-ap-southeast-1.amazonaws.com/linhtinh-hoangph/topIdols.json'}).then(result => result.data.map(idol => {
                    return {
                        id: idol.ID,
                        name: idol.Name,
                        link: `http://www.jjgirls.com${idol.Link}`,
                        thumbnail: nameToLink(idol.Name),
                        bigThumb: nameToLink(idol.Name).replace('cute-', '')
                    };
                }));
            }
        }
    }
]);

app.factory('recognizeService', [
    '$q',
    '$http',
    'toastr',
    ($q, $http, toastr) => ({
        uploadImage(imgBase64) {
            toastr.info("Đang up ảnh");
            const url = 'https://api.cloudinary.com/v1_1/hoangcloud/image/upload';

            return $http({
                method: 'POST',
                url,
                data: {
                    upload_preset: 'jav-idols',
                    file: imgBase64
                }
            });
        },

        getImageSize(imgLink) {
            return $q((resolve, reject) => {
                const img = new Image(); // Create new img element
                img.addEventListener("load", () => {
                    resolve({width: img.width, height: img.height});
                }, false);
                img.src = imgLink; // Set source path
            });
        },

        recognizeImage(imgLink) {
            toastr.info("Đang nhận diện, có thể hơi lâu, vui lòng chờ");
            const url = 'https://jav-recognize.azurewebsites.net/api/HttpTriggerCSharp1';

            return $http({
                method: 'POST',
                url,
                headers: {
                    'x-functions-key': 'k7dgy05qyfs8uwjvjrjdobt9x17c3yu0gteqyd0qqkomeu3di60kxsrkutl9yge0s2ixiil766r'
                },
                data: {
                    url: imgLink
                }
            }).then((result) => {
                return this.getImageSize(imgLink).then(size => {
                    toastr.success('Xong rồi ahihi :">"');
                    const originalWidth = size.width;
                    const currentWidth = document.querySelector('#source-image').clientWidth;
                    const ratio = currentWidth / originalWidth;
                    const faces = result.data.map(r => {
                        const face = r.face.faceRectangle;
                        const faceStyle = {
                            width: `${face.width * ratio}px`,
                            height: `${face.height * ratio}px`,
                            left: `${face.left * ratio}px`,
                            top: `${face.top * ratio}px`
                        };

                        let fontSize = (face.width * ratio / 6);
                        let minFontSize = 15;
                        fontSize = Math.max(fontSize, minFontSize);

                        let candidate = {
                            name: 'Unknown',
                            nameStyle: {
                                width: faceStyle.width,
                                'font-size': `${fontSize}px`,
                                'line-height': `${fontSize - 2}px`,
                                bottom: `-${fontSize}px`
                            }
                        };
                        if (r.candidates.length > 0) {
                            const firstCandidate = r.candidates[0].idol;
                            candidate.name = firstCandidate.name;
                            candidate.link = firstCandidate.Link;
                        };
                        return {face: faceStyle, candidate};
                    });

                    return faces;
                });
            }, (error) => {
                toastr.error('Có lỗi xuất hiện');
                var errorInfo = error.data.error;
                if (errorInfo.code == 'InvalidURL') {
                    toastr.error('Link ảnh bị lỗi. Vui lòng dùng link khác.');
                }
            });
        }
    })
]);

app.controller('mainCtrl', [
    '$scope',
    'recognizeService',
    'idolService',
    'toastr',
    '$firebaseArray',
    ($scope, recognizeService, idolService, toastr, $firebaseArray) => {
        $scope.input = {
            source: 'link',
            imageLink: ""
        };
        $scope.isLoading = false;
        $scope.testImages = ['http://res.cloudinary.com/hoangcloud/image/upload/v1481518034/jav-idols/u6dmau0dvs0bbzohgh8f.jpg', 'http://res.cloudinary.com/hoangcloud/image/upload/v1481515410/jav-idols/olzmtmys7prvep3z0ckf.jpg', 'http://res.cloudinary.com/hoangcloud/image/upload/v1481451527/jav-idols/dhsxrhbvsayxz57smane.jpg', 'http://wallpaperim.net/upload/2014/10/12/20141012102829-81eb8fcc.jpg'];

        $scope.backends = ['cognitive.jpg', 'azure.jpg', 'netcore.png', 'amazons3.png', 'ec2.png', 'cloudinary.png', 'redis.jpg'];
        $scope.frontends = ['github.jpg', 'semantic.png', 'angular.png'];

        var ref = firebase.database().ref().child("latest");
        // No order by desceding, render item be descending order then
        var query = ref.orderByChild("timestamp").limitToLast(8);
        $scope.latestEntries = $firebaseArray(query);

        idolService.loadIdols().then(result => {
            $scope.idols = result;
        });

        // Reset image link when change sourcesource
        $scope.$watch('input.source', (newVal, oldVal) => {
            $scope.input.imageLink = "";
        });

        $scope.$watch('input.imageLink', (newVal, oldVal) => {
            $scope.faces = [];
        });

        $scope.recognize = () => {
            if (!isImageValid() || $scope.isLoading)
                return;

            $scope.isLoading = true;
            if ($scope.input.source == 'link') {
                recognizeService.recognizeImage($scope.input.imageLink).then(displayResult);
            } else {
                recognizeService.uploadImage($scope.input.imageLink).then(result => {
                    const url = result.data.url;
                    $scope.input.imageLink = url;
                    return url;
                }).then(recognizeService.recognizeImage.bind(recognizeService)).then(displayResult);
            }
        }

        function displayResult(result) {
            $scope.isLoading = false;
            $scope.faces = result;
            if ($scope.faces.length == 0) {
                toastr.warning('Không nhận diện được uhuhu T.T');
            } else {

                $scope.latestEntries.$add({
                    image: $scope.input.imageLink,
                    time: moment().format(),
                    idols: result.map(face => face.candidate.name).join(', ')
                });
            }
        }

        function isImageValid() {
            if ($scope.input.source == 'link') {
                var regex = /[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
                if (!regex.test($scope.input.imageLink)) {
                    toastr.error('URL không hợp lệ');
                    return false;
                }
            } else {
                if ($scope.input.imageLink.indexOf('data:image') == -1) {
                    toastr.error('File không hợp lệ');
                    return false;
                }
            }
            return true;
        }
    }
]);
