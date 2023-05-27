#!/usr/bin/awk -f

BEGIN {
    counter = 0
    replacement = strftime("%Y-%m-%dT%H:%M:%S%z")
}

/<lastmod>/ && counter < 2 {
    counter++
    sub("<lastmod>.*</lastmod>", "<lastmod>" replacement "</lastmod>", $0)
}

{
    print
}
