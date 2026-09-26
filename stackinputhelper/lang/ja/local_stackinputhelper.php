<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * lang ja local stackinputhelper.php for Hand2STACK.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
$string['pluginname'] = 'Hand2STACK';
$string['mathpixappid'] = 'Mathpix App ID';
$string['mathpixappid_desc'] = 'Moodleプラグインのバックエンドで使用するMathpix App IDです。';
$string['mathpixappkey'] = 'Mathpix App Key';
$string['mathpixappkey_desc'] = 'Mathpix App Keyです。この値はMoodle設定に保存され、ブラウザには送信されません。';
$string['enabled'] = 'Hand2STACKを有効にする';
$string['enabled_desc'] = 'Hand2STACKプラグインを有効または無効にします。';
$string['maxfilesize'] = '最大画像サイズ';
$string['maxfilesize_desc'] = 'アップロードできる画像サイズの上限（MB）です。';
$string['ratelimit'] = '1分あたりの認識リクエスト数';
$string['ratelimit_desc'] = '1ユーザが1分間に実行できる有料の画像・手書き認識の最大回数です。0の場合は安全な既定値20を使用します。';
$string['enablemobile'] = 'モバイルアップロードを有効にする';
$string['enablemobile_desc'] = 'QRコードを使ってモバイル端末から数式画像をアップロードできるようにします。';
$string['mobilebaseurl'] = 'モバイル用公開ベースURL';
$string['mobilebaseurl_desc'] = 'Usually leave this empty to use the Moodle site URL automatically, including any subdirectory such as /projects. Set it only when phones must use a different externally reachable Moodle base URL.';
$string['uploadbtn'] = '数式画像をアップロード';
$string['mobileuploadbtn'] = 'モバイル数式アップロード';
$string['camerabtn'] = '写真を撮る';
$string['uploading'] = '認識中...';
$string['nofieldfound'] = '表示中の解答入力欄が見つかりませんでした。';
$string['recognizefailed'] = '認識に失敗しました。';
$string['requestfailed'] = 'The request could not be completed. Please try again or contact the administrator.';
$string['ratelimitexceeded'] = '認識リクエストが多すぎます。1分待ってから再試行してください。';
$string['taskcleanupexpiredsessions'] = 'Delete expired Hand2STACK sessions';
$string['invalidfiletype'] = 'JPG、PNG、またはWebP画像をアップロードしてください。';
$string['filetoolarge'] = 'アップロードされた画像が大きすぎます。';
$string['emptyuploadedfile'] = 'アップロードされた画像が空です。';
$string['invalidimagecontents'] = 'アップロードされたファイルを有効な画像として読み込めませんでした。';
$string['imagedimensionstoolarge'] = 'アップロードされた画像の解像度が大きすぎます。';
$string['imagevalidationunavailable'] = 'サーバ側の画像検証を利用できません。PHPのFileinfoとGDが必要です。';
$string['unsupportedserverimageformat'] = 'このサーバではアップロードされた画像形式を読み込めません。JPGまたはPNG画像を使用してください。';
$string['missingmathpixcredentials'] = 'Mathpix App IDまたはApp Keyが設定されていません。';
$string['invaliduploadedfile'] = 'アップロードされたファイルが無効です。';
$string['curlrequired'] = 'PHP cURL拡張が必要です。';
$string['mathpixrequestfailed'] = 'Mathpixへのリクエストに失敗しました。';
$string['mathpixinvalidresponse'] = 'Mathpixから無効なレスポンスが返されました。';
$string['pluginnotenabled'] = 'Hand2STACKは無効です。';
$string['mobilenotenabled'] = 'モバイルアップロードは無効です。';
$string['sessionexpired'] = 'このモバイルアップロードセッションは期限切れです。';
$string['mobileuploadinstructions'] = '数式の写真を撮影してください。認識結果は、このセッションを作成したMoodleページへ送信されます。';
$string['mobileuploadcomplete'] = 'アップロードが完了しました。元のMoodleページに戻ってください。';
$string['nofilechosen'] = '先に画像を選択してください。';
$string['takephoto'] = '写真を撮る';
$string['usethisphoto'] = 'この写真を使用';
$string['recognizedresults'] = '認識結果';
$string['selectanswer'] = '結果を選択または編集してから答案に挿入してください。';
$string['recognizedworking'] = '認識された数学的な解答過程です。挿入する前に確認・編集してください:';
$string['selectpart'] = '記号をクリックするか、数式上をドラッグして範囲選択します。';
$string['recommendedanswer'] = '推奨';
$string['edited'] = '編集済み';
$string['restoreocr'] = 'OCR結果に戻す';
$string['stackpreview'] = 'STACK入力プレビュー:';
$string['convertedstack'] = 'STACK用変換結果:';
$string['freetextpreview'] = '自由記述の解答過程プレビュー:';
$string['insertanswer'] = '答案欄に挿入';
$string['rawlatex'] = 'LaTeX';
$string['recognizedformat'] = '編集可能な結果';
$string['asciimath'] = 'ASCII';
$string['asciiunavailable'] = 'この画像ではASCII形式が返されませんでした。';
$string['lineprefix'] = '行';
$string['creatingmobilesession'] = 'モバイルアップロードセッションを作成しています...';
$string['waitingmobileupload'] = 'モバイルからのアップロードを待っています...';
$string['mobileuploadreceived'] = 'モバイルからの認識結果を受信しました。同じQRコードで別の写真もアップロードできます。';
$string['mobileuploadexpired'] = 'このモバイルアップロードセッションは期限切れです。';
$string['mobileuploadtimeout'] = '結果待ちがタイムアウトしました。新しいセッションを作成してください。';
$string['mobilesessionfailed'] = 'モバイルセッションの作成に失敗しました:';
$string['partialselectionfailed'] = '選択したテキストを変換できませんでした。';
$string['handwritebtn'] = '数式を手書き';
$string['handwriteinstructions'] = 'Apple Pencil、指、またはマウスで書いてください。スクロールするには、手書き領域の外側を指でドラッグしてください。';
$string['resizehandwriting'] = 'ドラッグして手書き領域の大きさを変更';
$string['undo'] = '元に戻す';
$string['clear'] = '消去';
$string['recognizestrokes'] = '手書きを認識';
$string['nostrokes'] = '先に数式を書いてください。';
$string['invalidstrokes'] = '手書きストロークデータが無効です。';
$string['emptylatex'] = '選択された数式が空です。';
$string['invalidstackexpression'] = '編集した数式を有効なSTACK入力に変換できませんでした。数式を確認して再試行してください。';
$string['stackvalidationunavailable'] = 'このサーバでSTACK入力検証を利用できません。';
$string['conversioninprogress'] = '変換と検証中...';
$string['pollingfailed'] = 'モバイル接続が一時的に中断されました。再試行中...';
$string['privacy:metadata:mathpix'] = 'アップロードされた画像と手書きストロークは数式認識のためMathpixへ送信されます。';
$string['privacy:metadata:mathpix:image'] = 'ユーザがアップロードした数式画像です。';
$string['privacy:metadata:mathpix:strokes'] = 'ユーザのペンまたはマウスから取得した手書き座標です。';
$string['privacy:metadata:session'] = '一時的なモバイルアップロードセッションと認識結果です。';
$string['privacy:metadata:session:userid'] = 'モバイルアップロードセッションを作成したユーザです。';
$string['privacy:metadata:session:rawlatex'] = 'Mathpixから返された生のLaTeXです。';
$string['privacy:metadata:session:rawascii'] = 'Mathpixから返されたAsciiMathです。';
$string['privacy:metadata:session:stack'] = '生のLaTeXから生成されたSTACK式です。';
$string['privacy:metadata:session:resulttext'] = 'Moodleページに返される認識結果です。';
$string['privacy:metadata:session:timecreated'] = 'モバイルアップロードセッションの作成時刻です。';
$string['privacy:metadata:session:timemodified'] = 'モバイルアップロードセッションの最終更新時刻です。';
$string['privacy:metadata:session:expiresat'] = 'モバイルアップロードセッションの有効期限です。';
